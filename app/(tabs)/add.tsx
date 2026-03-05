/**
 * Add Tab — dummy screen (never shown)
 * Tab press opens form modal via listener in _layout.tsx
 */

import { Redirect } from 'expo-router';

export default function AddScreen() {
  return <Redirect href="/form" />;
}
