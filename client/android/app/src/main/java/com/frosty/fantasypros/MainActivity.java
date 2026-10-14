package com.frosty.fantasypros;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    registerPlugin(EspnBridgePlugin.class);
    super.onCreate(savedInstanceState);
  }
}
