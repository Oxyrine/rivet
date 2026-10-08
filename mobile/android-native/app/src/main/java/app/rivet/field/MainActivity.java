package app.rivet.field;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

import java.net.HttpURLConnection;
import java.net.URL;

public class MainActivity extends Activity {
    private static final String WORKSPACE_URL = "https://rivet-lyart.vercel.app/tech";
    private static final String HEALTH_URL = "https://rivet-lyart.vercel.app/api/health";
    private TextView connectionStatus;
    private WebView workspace;

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
}