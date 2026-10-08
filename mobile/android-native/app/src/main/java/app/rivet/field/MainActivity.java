package app.rivet.field;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ClipData;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.MediaStore;
import android.view.Gravity;
import android.webkit.GeolocationPermissions;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.window.OnBackInvokedDispatcher;

import androidx.core.content.FileProvider;

import java.io.File;
import java.io.IOException;
import java.net.HttpURLConnection;
import java.net.URL;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.List;
import java.util.Locale;

public class MainActivity extends Activity {
    private static final String RIVET_HOST = "rivet-lyart.vercel.app";
    private static final String WORKSPACE_URL = "https://" + RIVET_HOST + "/tech";
    private static final String HEALTH_URL = "https://" + RIVET_HOST + "/api/health";
    // One request code per thing being asked for, so each answer resumes the right action.
    private static final int WEB_CAMERA_REQUEST = 600;
    private static final int FILE_CHOOSER_REQUEST = 601;
    private static final int WEB_LOCATION_REQUEST = 602;
    private static final int CHOOSER_CAMERA_REQUEST = 603;
    private TextView connectionStatus;
    private WebView workspace;
    private PermissionRequest pendingWebPermissionRequest;
    private String pendingGeoOrigin;
    private GeolocationPermissions.Callback pendingGeoCallback;
    private WebChromeClient.FileChooserParams pendingChooserParams;
    private ValueCallback<Uri[]> filePathCallback;
    private File pendingCameraFile;
    private Uri pendingCameraUri;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        LinearLayout screen = new LinearLayout(this);
        screen.setOrientation(LinearLayout.VERTICAL);
        screen.setBackgroundColor(Color.rgb(246, 246, 241));

        LinearLayout header = new LinearLayout(this);
        header.setGravity(Gravity.CENTER_VERTICAL);
        header.setPadding(dp(20), dp(14), dp(12), dp(14));
        header.setBackgroundColor(Color.rgb(36, 53, 43));

        LinearLayout titleBlock = new LinearLayout(this);
        titleBlock.setOrientation(LinearLayout.VERTICAL);
        TextView brand = new TextView(this);
        brand.setText("RIVET / FIELD");
        brand.setTextColor(Color.WHITE);
        brand.setTextSize(17);
        brand.setLetterSpacing(0.08f);
        titleBlock.addView(brand);

        connectionStatus = new TextView(this);
        connectionStatus.setText("Checking connection…");
        connectionStatus.setTextColor(Color.rgb(200, 219, 201));
        connectionStatus.setTextSize(12);
        titleBlock.addView(connectionStatus);
        header.addView(titleBlock, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1));

        Button browserButton = new Button(this);
        browserButton.setText("OPEN BROWSER");
        browserButton.setTextSize(11);
        browserButton.setOnClickListener(v -> startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(WORKSPACE_URL))));
        header.addView(browserButton, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, dp(42)));
        screen.addView(header);

        workspace = new WebView(this);
        workspace.getSettings().setJavaScriptEnabled(true);
        workspace.getSettings().setDomStorageEnabled(true);
        workspace.getSettings().setDatabaseEnabled(true);
        workspace.getSettings().setAllowFileAccess(true);
        workspace.getSettings().setAllowContentAccess(true);
        workspace.getSettings().setGeolocationEnabled(true);
        workspace.getSettings().setMediaPlaybackRequiresUserGesture(false);
        workspace.getSettings().setLoadWithOverviewMode(true);
        workspace.getSettings().setUseWideViewPort(true);
        workspace.setWebViewClient(new FieldWebClient());
        workspace.setWebChromeClient(new FieldChromeClient());
        screen.addView(workspace, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1));
        setContentView(screen);

        // targetSdk 36 uses predictive back, which no longer calls onBackPressed().
        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                    OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::goBackOrFinish);
        }

        workspace.loadUrl(WORKSPACE_URL);
        checkConnection();
    }

    private void goBackOrFinish() {
        if (workspace != null && workspace.canGoBack()) workspace.goBack();
        else finish();
    }

    @Override
    public void onBackPressed() {
        goBackOrFinish();
    }

    private boolean isRivet(String url) {
        Uri uri = Uri.parse(url == null ? "" : url);
        String host = uri.getHost();
        return "https".equals(uri.getScheme()) && host != null
                && (host.equals(RIVET_HOST) || host.endsWith("." + RIVET_HOST));
    }

    private boolean granted(int[] grantResults) {
        for (int result : grantResults) {
            if (result == PackageManager.PERMISSION_GRANTED) return true; // approximate location alone is enough
        }
        return false;
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        boolean ok = granted(grantResults);
        if (requestCode == WEB_CAMERA_REQUEST && pendingWebPermissionRequest != null) {
            if (ok) pendingWebPermissionRequest.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});
            else pendingWebPermissionRequest.deny();
            pendingWebPermissionRequest = null;
        } else if (requestCode == WEB_LOCATION_REQUEST && pendingGeoCallback != null) {
            pendingGeoCallback.invoke(pendingGeoOrigin, ok, false);
            pendingGeoCallback = null;
            pendingGeoOrigin = null;
        } else if (requestCode == CHOOSER_CAMERA_REQUEST && filePathCallback != null) {
            // Denied camera still lets the person pick an existing photo.
            launchChooser(pendingChooserParams, ok);
            pendingChooserParams = null;
        }
    }

    private File createImageFile() throws IOException {
        String timeStamp = new SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(new Date());
        String imageFileName = "RIVET_EVIDENCE_" + timeStamp + "_";
        File storageDir = getExternalFilesDir(Environment.DIRECTORY_PICTURES);
        if (storageDir == null || !storageDir.exists()) {
            storageDir = getCacheDir();
        }
        return File.createTempFile(imageFileName, ".jpg", storageDir);
    }

    @Override
    @SuppressWarnings("deprecation")
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != FILE_CHOOSER_REQUEST || filePathCallback == null) return;

        Uri[] results = null;
        if (resultCode == RESULT_OK) {
            if (data != null && data.getData() != null) {
                results = new Uri[]{data.getData()};
            } else if (data != null && data.getClipData() != null) {
                ClipData clipData = data.getClipData();
                results = new Uri[clipData.getItemCount()];
                for (int i = 0; i < clipData.getItemCount(); i++) {
                    results[i] = clipData.getItemAt(i).getUri();
                }
            } else if (pendingCameraUri != null && pendingCameraFile != null
                    && pendingCameraFile.exists() && pendingCameraFile.length() > 0) {
                results = new Uri[]{pendingCameraUri};
            }
        }

        if (pendingCameraUri != null) {
            try {
                revokeUriPermission(pendingCameraUri, Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
            } catch (Exception ignored) {}
        }

        filePathCallback.onReceiveValue(results);
        filePathCallback = null;
        pendingCameraFile = null;
        pendingCameraUri = null;
    }

    private boolean has(String permission) {
        return checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED;
    }

    private boolean hasLocation() {
        return has(Manifest.permission.ACCESS_FINE_LOCATION) || has(Manifest.permission.ACCESS_COARSE_LOCATION);
    }

    /** Opens the photo picker / camera for a pending web file input. Camera is offered only when its permission is held. */
    private boolean launchChooser(WebChromeClient.FileChooserParams params, boolean useCamera) {
        Intent takePictureIntent = null;
        pendingCameraFile = null;
        pendingCameraUri = null;

        if (useCamera) {
            try {
                pendingCameraFile = createImageFile();
                pendingCameraUri = FileProvider.getUriForFile(this, getPackageName() + ".fileprovider", pendingCameraFile);

                takePictureIntent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
                takePictureIntent.putExtra(MediaStore.EXTRA_OUTPUT, pendingCameraUri);
                takePictureIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
                takePictureIntent.setClipData(ClipData.newRawUri("Rivet Evidence", pendingCameraUri));

                List<ResolveInfo> apps = getPackageManager().queryIntentActivities(takePictureIntent, PackageManager.MATCH_DEFAULT_ONLY);
                for (ResolveInfo app : apps) {
                    grantUriPermission(app.activityInfo.packageName, pendingCameraUri,
                            Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                }
            } catch (Exception e) {
                takePictureIntent = null;
                pendingCameraFile = null;
                pendingCameraUri = null;
            }
        }

        boolean captureOnly = params != null && params.isCaptureEnabled();
        if (captureOnly && takePictureIntent != null) {
            try {
                startActivityForResult(takePictureIntent, FILE_CHOOSER_REQUEST);
                return true;
            } catch (Exception ignored) {
            }
        }

        Intent pick = new Intent(Intent.ACTION_GET_CONTENT);
        pick.addCategory(Intent.CATEGORY_OPENABLE);
        pick.setType("image/*");
        if (params != null && params.getAcceptTypes() != null && params.getAcceptTypes().length > 0
                && !params.getAcceptTypes()[0].isEmpty()) {
            pick.putExtra(Intent.EXTRA_MIME_TYPES, params.getAcceptTypes());
        }

        Intent chooser = Intent.createChooser(pick, "Add Service Evidence / Photo");
        if (takePictureIntent != null) {
            chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[]{takePictureIntent});
        }

        try {
            startActivityForResult(chooser, FILE_CHOOSER_REQUEST);
            return true;
        } catch (Exception error) {
            if (filePathCallback != null) {
                filePathCallback.onReceiveValue(null);
                filePathCallback = null;
            }
            pendingCameraFile = null;
            pendingCameraUri = null;
            return false;
        }
    }

    private void checkConnection() {
        new Thread(() -> {
            String result = "Offline — open the browser once you reconnect";
            try {
                HttpURLConnection connection = (HttpURLConnection) new URL(HEALTH_URL).openConnection();
                connection.setConnectTimeout(6000);
                connection.setReadTimeout(6000);
                connection.setRequestMethod("GET");
                result = connection.getResponseCode() == 200 ? "Connected to Rivet" : "Service is temporarily unavailable";
                connection.disconnect();
            } catch (Exception ignored) {
            }
            String status = result;
            new Handler(Looper.getMainLooper()).post(() -> connectionStatus.setText(status));
        }).start();
    }

    private int dp(int value) {
        return (int) (value * getResources().getDisplayMetrics().density + 0.5f);
    }

    private class FieldWebClient extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            if (isRivet(request.getUrl().toString())) return false;
            view.getContext().startActivity(new Intent(Intent.ACTION_VIEW, request.getUrl()));
            return true;
        }
    }

    private class FieldChromeClient extends WebChromeClient {
        /** getUserMedia: the barcode scanner. Asks Android for camera access first, then answers the page. */
        @Override
        public void onPermissionRequest(PermissionRequest request) {
            boolean asksForVideo = false;
            for (String resource : request.getResources()) {
                if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource)) asksForVideo = true;
            }
            if (!asksForVideo || !isRivet(request.getOrigin().toString())) {
                request.deny();
                return;
            }
            if (has(Manifest.permission.CAMERA)) {
                request.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});
                return;
            }
            if (pendingWebPermissionRequest != null) pendingWebPermissionRequest.deny();
            pendingWebPermissionRequest = request;
            requestPermissions(new String[]{Manifest.permission.CAMERA}, WEB_CAMERA_REQUEST);
        }

        @Override
        public void onPermissionRequestCanceled(PermissionRequest request) {
            if (pendingWebPermissionRequest == request) pendingWebPermissionRequest = null;
            super.onPermissionRequestCanceled(request);
        }

        /** navigator.geolocation: the GPS check-in. */
        @Override
        public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
            if (!isRivet(origin)) {
                callback.invoke(origin, false, false);
                return;
            }
            if (hasLocation()) {
                callback.invoke(origin, true, false);
                return;
            }
            if (pendingGeoCallback != null) pendingGeoCallback.invoke(pendingGeoOrigin, false, false);
            pendingGeoOrigin = origin;
            pendingGeoCallback = callback;
            requestPermissions(new String[]{
                    Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION
            }, WEB_LOCATION_REQUEST);
        }

        @Override
        public void onGeolocationPermissionsHidePrompt() {
            pendingGeoCallback = null;
            pendingGeoOrigin = null;
        }

        /** <input type=file>: take photo / attach photo. */
        @Override
        public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> callback, FileChooserParams params) {
            if (filePathCallback != null) filePathCallback.onReceiveValue(null);
            filePathCallback = callback;
            if (!has(Manifest.permission.CAMERA)) {
                // Ask first and open the picker from the answer: with CAMERA declared, launching the camera before it is granted throws.
                pendingChooserParams = params;
                requestPermissions(new String[]{Manifest.permission.CAMERA}, CHOOSER_CAMERA_REQUEST);
                return true;
            }
            return launchChooser(params, true);
        }
    }
}
