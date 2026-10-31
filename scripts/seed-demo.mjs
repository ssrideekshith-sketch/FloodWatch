import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

const projectId = process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID || 'flood-alert-mru'
if (projectId !== 'flood-alert-mru') throw new Error(`Refusing to seed unexpected Firebase project: ${projectId}`)

const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
const app = getApps().length
  ? getApps()[0]
  : initializeApp(serviceAccountJson ? { credential: cert(JSON.parse(serviceAccountJson)), projectId } : { projectId })
const db = getFirestore(app)

const records = {
  FloodAlerts: {
    'demo-alert-hyderabad-01': {
      title: 'Demonstration flood advisory', severity: 'Advisory', area: 'Hussain Sagar (demonstration)',
      description: 'Fictional demonstration content for the FloodWatch college project. This is not a real emergency.',
      isDemonstration: true, demoLabel: 'DEMONSTRATION DATA — NOT A REAL EMERGENCY', latitude: 17.4239, longitude: 78.4738,
      updatedAt: FieldValue.serverTimestamp(), source: 'FloodWatch demonstration seed'
    }
  },
  FloodReports: {
    'demo-report-hyderabad-01': {
      userId: 'demo-seed', location: 'Begumpet demonstration point', waterLevel: 'medium',
      description: 'Fictional map marker used for demonstration only.', needsHelp: false, peopleCount: 0,
      requestedResources: [], status: 'Pending', isDemonstration: true, demoLabel: 'DEMO — NOT A REAL REPORT',
      latitude: 17.4448, longitude: 78.4661, createdAt: FieldValue.serverTimestamp(), source: 'FloodWatch demonstration seed'
    }
  },
  Shelters: {
    'demo-shelter-hyderabad-01': {
      name: 'Demonstration Community Hall', address: 'Tank Bund, Hyderabad (fictional)', available: 120, capacity: 180,
      status: 'Open', isDemonstration: true, demoLabel: 'DEMO — NOT A VERIFIED SHELTER', latitude: 17.4239, longitude: 78.4738,
      updatedAt: FieldValue.serverTimestamp(), source: 'FloodWatch demonstration seed'
    }
  },
  Resources: {
    'demo-resource-hyderabad-01': {
      name: 'Demonstration relief supplies', title: 'Fictional resource marker', address: 'Secunderabad demonstration point',
      quantity: 50, unit: 'kits', isDemonstration: true, demoLabel: 'DEMO — NOT A VERIFIED RESOURCE', latitude: 17.4399, longitude: 78.4983,
      updatedAt: FieldValue.serverTimestamp(), source: 'FloodWatch demonstration seed'
    }
  }
}

for (const [collectionName, documents] of Object.entries(records)) {
  for (const [id, data] of Object.entries(documents)) {
    await db.collection(collectionName).doc(id).set(data, { merge: true })
    console.log(`Seeded ${collectionName}/${id}`)
  }
}
console.log('Demo seed complete. Records are fictional and clearly labelled.')
