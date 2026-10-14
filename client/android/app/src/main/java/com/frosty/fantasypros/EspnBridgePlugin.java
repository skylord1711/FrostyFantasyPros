package com.frosty.fantasypros;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.webkit.CookieManager;

import androidx.browser.customtabs.CustomTabsIntent;

import com.getcapacitor.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;

public class EspnBridgePlugin extends Plugin {

  private PluginCall pendingCall;

  @PluginMethod
  public void espnLogin(PluginCall call) {
    if (pendingCall != null) {
      call.reject("login_already_running");
      return;
    }
    pendingCall = call;
    String url = "https://www.espn.com/login?redirect=https%3A%2F%2Ffantasy.espn.com%2F";
    CustomTabsIntent tabs = new CustomTabsIntent.Builder().setShowTitle(true).build();
    Intent intent = tabs.intent;
    intent.setData(Uri.parse(url));
    startActivityForResult(call, intent, "loginResult");
  }

  @ActivityCallback
  private void loginResult(PluginCall call, ActivityResult result) {
    pendingCall = null;
    // Give the tab a beat to finish writing cookies, then read them.
    new Handler(Looper.getMainLooper()).postDelayed(() -> finishLogin(call), 1500);
  }

  private void finishLogin(PluginCall call) {
    CookieManager cm = CookieManager.getInstance();
    String espnS2 = null;
    String swid = null;
    for (String host : new String[] { "https://fantasy.espn.com", "https://www.espn.com", "https://espn.com", ".espn.com" }) {
      String cookie = cm.getCookie(host);
      if (cookie == null) continue;
      for (String part : cookie.split(";")) {
        String kv = part.trim();
        int eq = kv.indexOf('=');
        if (eq <= 0) continue;
        String k = kv.substring(0, eq);
        String v = kv.substring(eq + 1);
        if ("espn_s2".equals(k) && (espnS2 == null || espnS2.isEmpty())) espnS2 = v;
        if ("SWID".equalsIgnoreCase(k) && (swid == null || swid.isEmpty())) swid = v;
      }
      if (espnS2 != null && !espnS2.isEmpty() && swid != null && !swid.isEmpty()) break;
    }
    JSObject out = new JSObject();
    if (espnS2 != null && !espnS2.isEmpty() && swid != null && !swid.isEmpty()) {
      out.put("espnS2", espnS2);
      out.put("swid", swid);
      out.put("via", "espn_web_login");
      call.resolve(out);
    } else {
      call.reject("no_espn_session", "Log in to ESPN in the window that opened, then try again.");
    }
  }
}
