package app.rivet.field;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ClipData;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.MediaStore;
import android.view.Gravity;
import android.view.View;
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
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Arrays;

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
    private Uri pendingCameraPhoto;

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
        if (requestCode != CAMERA_PERMISSION_REQUEST || pendingWebPermissionRequest == null) return;
        PermissionRequest request = pendingWebPermissionRequest;
        pendingWebPermissionRequest = null;
        boolean granted = grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED;
        if (granted && isTrustedRivetOrigin(request.getOrigin())) {
            request.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});
        } else {
            request.deny();
        }
    }

    @Override
    @SuppressWarnings("deprecation")
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != FILE_CHOOSER_REQUEST || filePathCallback == null) return;
        Uri[] result = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
        if ((result == null || result.length == 0) && resultCode == RESULT_OK && pendingCameraPhoto != null) {
            result = new Uri[]{pendingCameraPhoto};
        }
        filePathCallback.onReceiveValue(result);
        filePathCallback = null;
        pendingCameraPhoto = null;
    }

    private boolean isTrustedRivetOrigin(Uri origin) {
        return origin != null && "https".equals(origin.getScheme()) && RIVET_HOST.equals(origin.getHost());
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
            boolean asksForVideo = Arrays.asList(request.getResources()).contains(PermissionRequest.RESOURCE_VIDEO_CAPTURE);
            if (!isTrustedRivetOrigin(request.getOrigin()) || !asksForVideo) {
                request.deny();
                return;
            }
            if (hasCameraPermission()) {
                request.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});
                return;
            }
            if (pendingWebPermissionRequest != null) pendingWebPermissionRequest.deny();
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
            if (filePathCallback != null) filePathCallback.onReceiveValue(null);
            filePathCallback = callback;
            Intent selectImage = new Intent(Intent.ACTION_GET_CONTENT)
                    .addCategory(Intent.CATEGORY_OPENABLE)
                    .setType("image/*");
            Intent camera = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
            File target = new File(getCacheDir(), "rivet-evidence-" + System.currentTimeMillis() + ".jpg");
            pendingCameraPhoto = FileProvider.getUriForFile(MainActivity.this, getPackageName() + ".fileprovider", target);
            camera.putExtra(MediaStore.EXTRA_OUTPUT, pendingCameraPhoto);
            camera.setClipData(ClipData.newRawUri("Rivet evidence", pendingCameraPhoto));
            camera.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            Intent chooser = Intent.createChooser(selectImage, "Add service evidence");
            chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[]{camera});
            try {
                startActivityForResult(chooser, FILE_CHOOSER_REQUEST);
            } catch (Exception error) {
                filePathCallback.onReceiveValue(null);
                filePathCallback = null;
                pendingCameraPhoto = null;
            }
            return true;
        }
    }
}
