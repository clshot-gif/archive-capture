import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { ActivityIndicator, View } from 'react-native';
import { GoogleSignin } from '@react-native-google-signin/google-signin';

import OnboardingScreen from '../screens/OnboardingScreen';
import ScannerScreen from '../screens/ScannerScreen';
import MarkupScreen from '../screens/MarkupScreen';
import ConfirmationScreen from '../screens/ConfirmationScreen';
import SettingsScreen from '../screens/SettingsScreen';
import TagVocabularyScreen from '../screens/TagVocabularyScreen';

import * as StorageService from '../services/StorageService';
import * as DriveService from '../services/DriveService';
import Config from '../config/Config';

const Stack = createStackNavigator();

export default function AppNavigator() {
  const [initialRoute, setInitialRoute] = useState(null);

  useEffect(() => {
    GoogleSignin.configure({
      webClientId: Config.GOOGLE_WEB_CLIENT_ID,
      scopes: ['https://www.googleapis.com/auth/drive.file'],
      offlineAccess: false,
    });

    async function determineStart() {
      const project = await StorageService.loadProject();
      const signedIn = await StorageService.loadSignedIn();

      if (project && signedIn) {
        try {
          const { accessToken } = await GoogleSignin.getTokens();
          DriveService.setAccessToken(accessToken);
        } catch (_) {
          // Token refresh failed — still go to Scanner, Drive calls will queue offline
        }
        setInitialRoute('Scanner');
      } else {
        setInitialRoute('Onboarding');
      }
    }
    determineStart();
  }, []);

  if (!initialRoute) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#1565C0" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName={initialRoute}
        screenOptions={{ headerShown: false }}
      >
        <Stack.Screen name="Onboarding" component={OnboardingScreen} />
        <Stack.Screen name="Scanner" component={ScannerScreen} />
        <Stack.Screen name="Markup" component={MarkupScreen} />
        <Stack.Screen name="Confirmation" component={ConfirmationScreen} />
        <Stack.Screen name="Settings" component={SettingsScreen} />
        <Stack.Screen name="TagVocabulary" component={TagVocabularyScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
