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
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.MediaStore;
import android.view.Gravity;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

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
    private static final int CAMERA_PERMISSION_REQUEST = 600;
    private static final int FILE_CHOOSER_REQUEST = 601;
    private TextView connectionStatus;
    private WebView workspace;
    private PermissionRequest pendingWebPermissionRequest;
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
        workspace.getSettings().setMediaPlaybackRequiresUserGesture(false);
        workspace.getSettings().setLoadWithOverviewMode(true);
        workspace.getSettings().setUseWideViewPort(true);
        workspace.setWebViewClient(new FieldWebClient());
        workspace.setWebChromeClient(new FieldChromeClient());
        screen.addView(workspace, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1));
        setContentView(screen);

        workspace.loadUrl(WORKSPACE_URL);
        checkConnection();
    }

    @Override
    public void onBackPressed() {
        if (workspace != null && workspace.canGoBack()) {
            workspace.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == CAMERA_PERMISSION_REQUEST && pendingWebPermissionRequest != null) {
            boolean granted = grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED;
            if (granted) {
                pendingWebPermissionRequest.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});
            } else {
                pendingWebPermissionRequest.deny();
            }
            pendingWebPermissionRequest = null;
        }
    }

    private File createImageFile() throws IOException {
        String timeStamp = new SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(new Date());
        String imageFileName = "RIVET_EVIDENCE_" + timeStamp + "_";
        File storageDir = getExternalFilesDir(Environment.DIRECTORY_PICTURES);
        if (storageDir == null || !storageDir.exists()) {
            storageDir = getCacheDir();
        }
        return File.createTempFile(
                imageFileName,
                ".jpg",
                storageDir
        );
    }

    @Override
    @SuppressWarnings("deprecation")
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != FILE_CHOOSER_REQUEST || filePathCallback == null) return;

        Uri[] results = null;
        if (resultCode == RESULT_OK) {
            if (data != null && data.getData() != null) {
                // File picked from gallery or document provider
                results = new Uri[]{data.getData()};
            } else if (data != null && data.getClipData() != null) {
                // Multiple files picked
                ClipData clipData = data.getClipData();
                results = new Uri[clipData.getItemCount()];
                for (int i = 0; i < clipData.getItemCount(); i++) {
                    results[i] = clipData.getItemAt(i).getUri();
                }
            } else if (pendingCameraFile != null && pendingCameraFile.exists() && pendingCameraFile.length() > 0) {
                // Direct camera photo was taken and written to file
                results = new Uri[]{pendingCameraUri};
            } else if (pendingCameraUri != null) {
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

    private boolean hasCameraPermission() {
        return checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED;
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

    private static class FieldWebClient extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if (uri.getHost() != null && uri.getHost().endsWith("rivet-lyart.vercel.app")) return false;
            view.getContext().startActivity(new Intent(Intent.ACTION_VIEW, uri));
            return true;
        }
    }

    private class FieldChromeClient extends WebChromeClient {
        @Override
        public void onPermissionRequest(PermissionRequest request) {
            boolean asksForVideo = false;
            if (request.getResources() != null) {
                for (String resource : request.getResources()) {
                    if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource)) {
                        asksForVideo = true;
                        break;
                    }
                }
            }
            if (!asksForVideo) {
                request.deny();
                return;
            }
            if (hasCameraPermission()) {
                request.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});
                return;
            }
            if (pendingWebPermissionRequest != null) {
                pendingWebPermissionRequest.deny();
            }
            pendingWebPermissionRequest = request;
            requestPermissions(new String[]{Manifest.permission.CAMERA}, CAMERA_PERMISSION_REQUEST);
        }

        @Override
        public void onPermissionRequestCanceled(PermissionRequest request) {
            if (pendingWebPermissionRequest == request) pendingWebPermissionRequest = null;
            super.onPermissionRequestCanceled(request);
        }

        @Override
        public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> callback, FileChooserParams params) {
            if (filePathCallback != null) {
                filePathCallback.onReceiveValue(null);
                filePathCallback = null;
            }
            filePathCallback = callback;

            if (!hasCameraPermission()) {
                requestPermissions(new String[]{Manifest.permission.CAMERA}, CAMERA_PERMISSION_REQUEST);
            }

            Intent takePictureIntent = null;
            pendingCameraFile = null;
            pendingCameraUri = null;

            try {
                pendingCameraFile = createImageFile();
                pendingCameraUri = FileProvider.getUriForFile(MainActivity.this, getPackageName() + ".fileprovider", pendingCameraFile);

                takePictureIntent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
                takePictureIntent.putExtra(MediaStore.EXTRA_OUTPUT, pendingCameraUri);
                takePictureIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
                takePictureIntent.setClipData(ClipData.newRawUri("Rivet Evidence", pendingCameraUri));

                List<ResolveInfo> resInfoList = getPackageManager().queryIntentActivities(takePictureIntent, PackageManager.MATCH_DEFAULT_ONLY);
                for (ResolveInfo resolveInfo : resInfoList) {
                    String packageName = resolveInfo.activityInfo.packageName;
                    grantUriPermission(packageName, pendingCameraUri, Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                }
            } catch (Exception e) {
                pendingCameraFile = null;
                pendingCameraUri = null;
            }

            boolean isCaptureOnly = params != null && params.isCaptureEnabled();

            if (isCaptureOnly && takePictureIntent != null) {
                try {
                    startActivityForResult(takePictureIntent, FILE_CHOOSER_REQUEST);
                    return true;
                } catch (Exception ignored) {
                }
            }

            Intent contentSelectionIntent = new Intent(Intent.ACTION_GET_CONTENT);
            contentSelectionIntent.addCategory(Intent.CATEGORY_OPENABLE);
            contentSelectionIntent.setType("image/*");
            if (params != null && params.getAcceptTypes() != null && params.getAcceptTypes().length > 0 && !params.getAcceptTypes()[0].isEmpty()) {
                contentSelectionIntent.putExtra(Intent.EXTRA_MIME_TYPES, params.getAcceptTypes());
            }

            Intent chooserIntent = Intent.createChooser(contentSelectionIntent, "Add Service Evidence / Photo");
            if (takePictureIntent != null) {
                chooserIntent.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[]{takePictureIntent});
            }

            try {
                startActivityForResult(chooserIntent, FILE_CHOOSER_REQUEST);
            } catch (Exception error) {
                if (filePathCallback != null) {
                    filePathCallback.onReceiveValue(null);
                    filePathCallback = null;
                }
                pendingCameraFile = null;
                pendingCameraUri = null;
                return false;
            }
            return true;
        }
    }
}
