import { getApps, initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'

const firebaseEnvironment = {
  NEXT_PUBLIC_FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  NEXT_PUBLIC_FIREBASE_APP_ID: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
} as const

export const firebaseConfig = {
  apiKey: firebaseEnvironment.NEXT_PUBLIC_FIREBASE_API_KEY?.trim(),
  authDomain: firebaseEnvironment.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN?.trim(),
  projectId: firebaseEnvironment.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim(),
  storageBucket: firebaseEnvironment.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim(),
  messagingSenderId: firebaseEnvironment.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID?.trim(),
  appId: firebaseEnvironment.NEXT_PUBLIC_FIREBASE_APP_ID?.trim(),
}

const placeholderValues = new Set([
  '',
  'undefined',
  'null',
  'your-api-key',
  'your-auth-domain',
  'your-project-id',
  'your-storage-bucket',
  'your-messaging-sender-id',
  'your-app-id',
  'apiKey',
  'authDomain',
  'projectId',
  'storageBucket',
  'messagingSenderId',
  'appId',
])

const invalidEnvironmentKeys = Object.entries(firebaseEnvironment)
  .filter(([, value]) => typeof value !== 'string' || placeholderValues.has(value.trim()))
  .map(([key]) => key)

export const firebaseInvalidEnvironmentKeys = invalidEnvironmentKeys
export const firebaseConfigured = invalidEnvironmentKeys.length === 0
export const firebaseProjectId = firebaseConfig.projectId
export const firebaseConfigurationError = !firebaseConfigured
  ? `Firebase configuration is missing or invalid for: ${invalidEnvironmentKeys.join(', ')}.`
  : firebaseConfig.projectId !== 'flood-alert-mru'
    ? `Firebase project mismatch: expected flood-alert-mru, received ${firebaseConfig.projectId}.`
    : ''
export const firebaseApp = firebaseConfigured
  ? getApps().length > 0
    ? getApps()[0]
    : initializeApp(firebaseConfig)
  : null
export const auth = firebaseApp ? getAuth(firebaseApp) : null
export const db = firebaseApp ? getFirestore(firebaseApp) : null
export const storage = firebaseApp ? getStorage(firebaseApp) : null
