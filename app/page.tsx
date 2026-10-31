'use client'

import dynamic from 'next/dynamic'
import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Bell, CheckCircle2, ChevronRight, CircleUserRound, Droplets, Home, LifeBuoy, List, LogIn, Map, Menu, Search, ShieldCheck, Siren, TentTree, Upload, Users, X } from 'lucide-react'
import { browserLocalPersistence, createUserWithEmailAndPassword, onAuthStateChanged, setPersistence, signInWithEmailAndPassword, signOut, updateProfile } from 'firebase/auth'
import { addDoc, collection, doc, getDoc, onSnapshot, query, serverTimestamp, setDoc, where } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { auth, db, firebaseConfig, firebaseConfigured, firebaseConfigurationError, storage } from '@/lib/firebase'

const LiveMap = dynamic(() => import('@/components/live-map'), { ssr: false })

const nav = [{ id: 'home', label: 'Overview', icon: Home }, { id: 'alerts', label: 'Flood alerts', icon: Bell }, { id: 'map', label: 'Live map', icon: Map }, { id: 'shelters', label: 'Shelter finder', icon: TentTree }, { id: 'report', label: 'Report flooding', icon: Siren }]

type FirestoreState<T> = { data: T[]; loading: boolean; error: string }
function useFirestoreCollection<T>(collectionName: string, userId?: string, ownerOnly = false, demonstrationOnly = false): FirestoreState<T> {
  const [state, setState] = useState<FirestoreState<T>>({ data: [], loading: true, error: '' })
  useEffect(() => {
    if (!firebaseConfigured || !db) { setState({ data: [], loading: false, error: 'Firebase is not configured.' }); return }
    if (!userId) { setState({ data: [], loading: false, error: 'Sign in to load live Firestore data.' }); return }
    const source = demonstrationOnly
      ? query(collection(db, collectionName), where('isDemonstration', '==', true))
      : ownerOnly
        ? query(collection(db, collectionName), where('userId', '==', userId))
        : query(collection(db, collectionName))
    return onSnapshot(source, (snapshot) => setState({ data: snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as T)), loading: false, error: '' }), (error) => {
      console.error('[v0] Firestore collection listener failed', { collectionName, code: error.code, message: error.message })
      setState({ data: [], loading: false, error: `Could not load ${collectionName}: ${error.code ?? error.message}` })
    })
  }, [collectionName, userId, ownerOnly, demonstrationOnly])
  return state
}

export default function Page() {
  const [screen, setScreen] = useState('home')
  const [menuOpen, setMenuOpen] = useState(false)
  const [authOpen, setAuthOpen] = useState(false)
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login')
  const [user, setUser] = useState<{ uid: string; email: string; role: string } | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [authPending, setAuthPending] = useState(false)
  const [status, setStatus] = useState('')
  const [authError, setAuthError] = useState('')
  const alertsState = useFirestoreCollection<Record<string, any>>('FloodAlerts', user?.uid)
  const sheltersState = useFirestoreCollection<Record<string, any>>('Shelters', user?.uid)
  const reportsState = useFirestoreCollection<Record<string, any>>('FloodReports', user?.uid, true)
  const demoReportsState = useFirestoreCollection<Record<string, any>>('FloodReports', user?.uid, false, true)
  const resourcesState = useFirestoreCollection<Record<string, any>>('Resources', user?.uid)

  useEffect(() => {
    const firebaseAuth = auth
    if (!firebaseAuth) { setAuthLoading(false); return }
    let unsubscribe = () => {}
    setPersistence(firebaseAuth, browserLocalPersistence)
      .then(() => {
        unsubscribe = onAuthStateChanged(firebaseAuth, async (firebaseUser) => {
      if (!firebaseUser) { setUser(null); setAuthLoading(false); return }
      try {
        const profileRef = db ? doc(db, 'users', firebaseUser.uid) : null
        let profile = profileRef ? await getDoc(profileRef) : null
        if (profileRef && profile && !profile.exists()) {
          await setDoc(profileRef, { uid: firebaseUser.uid, email: firebaseUser.email ?? '', role: 'citizen', createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
          profile = await getDoc(profileRef)
        }
        setUser({ uid: firebaseUser.uid, email: firebaseUser.email ?? '', role: profile?.data()?.role === 'administrator' ? 'administrator' : 'citizen' })
      } catch (error) {
        console.error('[v0] User profile load or recovery failed', { code: (error as { code?: string })?.code, message: (error as { message?: string })?.message })
        setUser({ uid: firebaseUser.uid, email: firebaseUser.email ?? '', role: 'citizen' })
        setStatus(`Signed in, but the user profile could not be loaded from Firestore. ${formatFirebaseError(error)}`)
      } finally { setAuthLoading(false) }
        })
      })
      .catch((error) => {
        setAuthLoading(false)
        setStatus(formatFirebaseError(error))
      })
    return () => unsubscribe()
  }, [])
  const [query, setQuery] = useState('')
  const liveShelters = sheltersState.data.length ? sheltersState.data : []
  const liveAlerts = alertsState.data
  const liveReports = useMemo(() => [...reportsState.data, ...demoReportsState.data.filter((demo) => !reportsState.data.some((report) => report.id === demo.id))], [reportsState.data, demoReportsState.data])
  const filteredShelters = useMemo(() => liveShelters.filter((s) => `${s.name ?? ''} ${s.address ?? ''}`.toLowerCase().includes(query.toLowerCase())), [query, liveShelters])

  function formatFirebaseError(error: unknown) {
    if (error instanceof Error && 'code' in error) {
      const code = String((error as { code?: string }).code)
      return `${code}: ${error.message}`
    }
    return error instanceof Error ? error.message : String(error)
  }

  async function handleAuth(form: FormData) {
    if (authPending) return
    if (!auth || !db || !firebaseConfigured || firebaseConfigurationError) { const message = firebaseConfigurationError || 'Firebase is not configured. Add the Firebase web app values to enable accounts.'; setAuthError(message); setStatus(''); return }
    const email = String(form.get('email') ?? '').trim().toLowerCase()
    const password = String(form.get('password') ?? '')
    if (!email || password.length < 6) { setAuthError('Enter a valid email and a password with at least 6 characters.'); return }
    setAuthPending(true); setAuthError(''); setStatus('')
    try {
      if (authMode === 'login') {
        await signInWithEmailAndPassword(auth, email, password)
        setAuthOpen(false); setStatus('Welcome back.')
      } else {
        const result = await createUserWithEmailAndPassword(auth, email, password)
        await updateProfile(result.user, { displayName: email.split('@')[0] })
        await setDoc(doc(db, 'users', result.user.uid), { uid: result.user.uid, email, role: 'citizen', createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
        console.info('[v0] Registration completed', { uid: result.user.uid, projectId: firebaseConfig.projectId })
        setAuthOpen(false); setStatus('Account created as citizen.')
      }
    } catch (error) {
      const code = error instanceof Error && 'code' in error ? String((error as { code?: string }).code) : ''
      const messages: Record<string, string> = { 'auth/email-already-in-use': 'That email is already registered. Try signing in.', 'auth/invalid-credential': 'The email or password is incorrect.', 'auth/invalid-email': 'Enter a valid email address.', 'auth/weak-password': 'Choose a stronger password with at least 6 characters.', 'auth/too-many-requests': 'Too many attempts. Try again later.', 'permission-denied': 'Firebase Authentication succeeded, but Firestore denied profile creation. Deploy firestore.rules and try again.' }
      setAuthError(messages[code] ? `${messages[code]} (${code})` : formatFirebaseError(error))
    } finally { setAuthPending(false) }
  }

  async function submitReport(form: FormData) {
    if (!auth?.currentUser || !db) { setStatus('Sign in with a configured Firebase project before submitting a real report.'); return }
    try {
      const photo = form.get('photo') as File
      let photoUrl = ''
      if (photo?.size && storage) { const fileRef = ref(storage, `report-images/${auth.currentUser.uid}/${crypto.randomUUID()}-${photo.name}`); await uploadBytes(fileRef, photo); photoUrl = await getDownloadURL(fileRef) }
      const doc = await addDoc(collection(db, 'FloodReports'), { userId: auth.currentUser.uid, location: String(form.get('location')), waterLevel: String(form.get('waterLevel')), description: String(form.get('description')), photoUrl, needsHelp: form.get('needsHelp') === 'on', peopleCount: Number(form.get('peopleCount') || 0), requestedResources: String(form.get('resources') || '').split(',').map((v) => v.trim()).filter(Boolean), status: 'Pending', createdAt: serverTimestamp() })
      setStatus(`Report submitted successfully. Reference: ${doc.id}`)
    } catch (error) { setStatus(`Could not submit the report. ${formatFirebaseError(error)}`) }
  }

  const pageTitle = nav.find((item) => item.id === screen)?.label ?? 'Overview'
  return <div className="min-h-screen bg-[#f4f7fb] text-[#10233f]">
    <header className="bg-[#071d3b] text-white"><div className="mx-auto flex max-w-[1400px] items-center justify-between px-5 py-4 lg:px-10"><button className="flex items-center gap-3" onClick={() => setScreen('home')}><span className="grid size-10 place-items-center rounded-xl bg-[#d9283c]"><Droplets className="size-5" /></span><span className="text-left"><strong className="block text-lg tracking-tight">FloodWatch</strong><small className="text-blue-200">Community response network</small></span></button><div className="hidden items-center gap-5 md:flex"><span className="flex items-center gap-2 text-xs text-blue-100"><span className="size-2 rounded-full bg-emerald-400" />Services operational</span>{authLoading ? <span className="text-sm text-blue-200">Checking account…</span> : user ? <button className="flex items-center gap-2 rounded-lg border border-white/20 px-3 py-2 text-sm" onClick={async () => { await signOut(auth!); setStatus('Signed out.') }}><CircleUserRound className="size-4" />{user.email}<span className="text-xs text-blue-200">{user.role === 'administrator' ? 'Administrator' : 'Citizen'}</span></button> : <button className="flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-[#071d3b]" onClick={() => setAuthOpen(true)}><LogIn className="size-4" />Sign in</button>}</div><button className="md:hidden" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle menu"><Menu /></button></div></header>
    <div className="mx-auto flex max-w-[1400px]">
      <aside className={`${menuOpen ? 'block' : 'hidden'} absolute z-20 w-72 border-r border-slate-200 bg-white p-5 md:relative md:block md:min-h-[calc(100vh-76px)] md:w-64`}><div className="mb-8 rounded-xl bg-[#eaf1fa] p-4"><p className="text-xs font-bold uppercase tracking-widest text-[#315b86]">Your safety hub</p><p className="mt-2 text-sm leading-5 text-slate-600">Find trusted updates, shelters, and help during flooding.</p></div><nav className="space-y-1">{nav.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => { setScreen(id); setMenuOpen(false) }} className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm font-semibold ${screen === id ? 'bg-[#071d3b] text-white' : 'text-slate-600 hover:bg-slate-100'}`}><Icon className="size-[18px]" />{label}</button>)}<button onClick={() => setScreen('admin')} className={`mt-5 flex w-full items-center gap-3 rounded-lg border border-dashed px-3 py-3 text-left text-sm font-semibold ${screen === 'admin' ? 'border-[#d9283c] bg-red-50 text-[#b51f30]' : 'border-slate-300 text-slate-500'}`}><ShieldCheck className="size-[18px]" />Coordination desk</button></nav><div className="mt-12 border-t pt-5 text-xs leading-5 text-slate-400">In an emergency, call your local emergency services. This app does not replace emergency response.</div></aside>
      <main className="min-w-0 flex-1 px-5 py-7 lg:px-10"><div className="mb-7 flex items-start justify-between"><div><p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-[#d9283c]">FloodWatch / {pageTitle}</p><h1 className="text-3xl font-bold tracking-tight text-[#071d3b] md:text-4xl">{screen === 'home' ? 'Stay informed. Stay safe.' : pageTitle}</h1><p className="mt-2 max-w-2xl text-sm text-slate-500">{screen === 'home' ? 'A trusted source for local flood alerts, verified reports, and available community resources.' : 'Information is updated from the coordination network and clearly marked when it is demonstration data.'}</p></div>{screen === 'home' && <button onClick={() => setScreen('report')} className="hidden items-center gap-2 rounded-lg bg-[#d9283c] px-4 py-3 text-sm font-bold text-white shadow-sm md:flex"><Siren className="size-4" />Report flooding</button>}</div>{status && <div role="status" className="mb-6 flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900"><CheckCircle2 className="mt-0.5 size-4 shrink-0" />{status}<button className="ml-auto" onClick={() => setStatus('')}><X className="size-4" /></button></div>}
        {screen === 'home' && <HomeScreen setScreen={setScreen} alerts={liveAlerts} shelters={liveShelters} reports={liveReports} alertsState={alertsState} sheltersState={sheltersState} />}{screen === 'alerts' && <AlertsScreen state={alertsState} />}{screen === 'map' && <MapScreen alerts={liveAlerts} reports={liveReports} shelters={liveShelters} resources={resourcesState.data} states={[alertsState, reportsState, sheltersState, resourcesState]} />}{screen === 'shelters' && <ShelterScreen query={query} setQuery={setQuery} shelters={filteredShelters} state={sheltersState} />}{screen === 'report' && <ReportScreen onSubmit={submitReport} user={user} onSignIn={() => setAuthOpen(true)} />}{screen === 'admin' && <AdminScreen user={user} reports={liveReports} shelters={liveShelters} onSignIn={() => setAuthOpen(true)} />}
      </main>
    </div>
    {authOpen && <AuthModal mode={authMode} setMode={(nextMode) => { setAuthMode(nextMode); setAuthError('') }} onClose={() => { setAuthError(''); setAuthOpen(false) }} onSubmit={handleAuth} pending={authPending} error={authError} />}
  </div>
}

function Stat({ icon: Icon, value, label, color = 'blue' }: { icon: any; value: string; label: string; color?: string }) { return <div className="rounded-xl border border-slate-200 bg-white p-5"><div className={`mb-4 grid size-10 place-items-center rounded-lg ${color === 'red' ? 'bg-red-100 text-[#d9283c]' : 'bg-blue-100 text-[#245483]'}`}><Icon className="size-5" /></div><strong className="block text-3xl text-[#071d3b]">{value}</strong><span className="text-sm text-slate-500">{label}</span></div> }
function HomeScreen({ setScreen, alerts, shelters, reports, alertsState, sheltersState }: { setScreen: (s: string) => void; alerts: Record<string, any>[]; shelters: Record<string, any>[]; reports: Record<string, any>[]; alertsState: FirestoreState<Record<string, any>>; sheltersState: FirestoreState<Record<string, any>> }) { return <><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Stat icon={AlertTriangle} value={String(alerts.length)} label="Active alerts" color="red" /><Stat icon={Siren} value={String(reports.length)} label="Saved reports" /><Stat icon={TentTree} value={String(shelters.filter((s) => s.status !== 'Full').length)} label="Open shelters" /><Stat icon={LifeBuoy} value={String(shelters.reduce((sum, s) => sum + Number(s.available ?? 0), 0))} label="Places available" /></div><div className="mt-7 grid gap-6 xl:grid-cols-[1.4fr_1fr]"><section className="rounded-xl border border-red-200 bg-white p-6"><div className="mb-5 flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-widest text-[#d9283c]">Priority notice</p><h2 className="mt-1 text-xl font-bold">Current situation</h2></div><span className="rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-[#b51f30]">{alerts[0]?.severity ?? 'No active alert'}</span></div><div className="rounded-lg bg-[#fff4f4] p-4"><h3 className="font-bold">{alerts[0]?.title ?? 'No active flood alert'}</h3><p className="mt-1 text-sm text-slate-600">{alerts[0]?.area ?? 'No alert area published'} · {alerts[0]?.updatedAt?.toDate ? alerts[0].updatedAt.toDate().toLocaleString() : 'Awaiting live update'}</p><p className="mt-4 text-sm leading-6 text-slate-600">{alerts[0]?.description ?? 'Published alerts and safety instructions will appear here when coordinators add them to Firestore.'}</p><button onClick={() => setScreen('alerts')} className="mt-4 flex items-center gap-1 text-sm font-bold text-[#b51f30]">View safety instructions <ChevronRight className="size-4" /></button></div></section><section className="rounded-xl border border-slate-200 bg-white p-6"><div className="mb-5 flex items-center justify-between"><h2 className="text-xl font-bold">Quick actions</h2><LifeBuoy className="text-[#d9283c]" /></div><div className="space-y-3"><button onClick={() => setScreen('report')} className="flex w-full items-center justify-between rounded-lg bg-[#071d3b] p-4 text-left text-sm font-bold text-white">Report flooding <ChevronRight className="size-4" /></button><button onClick={() => setScreen('shelters')} className="flex w-full items-center justify-between rounded-lg border border-slate-200 p-4 text-left text-sm font-bold">Find an open shelter <ChevronRight className="size-4" /></button><button onClick={() => setScreen('map')} className="flex w-full items-center justify-between rounded-lg border border-slate-200 p-4 text-left text-sm font-bold">Open live map <ChevronRight className="size-4" /></button></div></section></div><section className="mt-7"><div className="mb-4 flex items-center justify-between"><h2 className="text-xl font-bold">Latest alerts</h2><button onClick={() => setScreen('alerts')} className="text-sm font-bold text-[#315b86]">See all</button></div><div className="grid gap-4 md:grid-cols-2">{alerts.length ? alerts.map((a) => <AlertCard key={a.id ?? a.title} alert={{ severity: a.severity ?? 'Advisory', title: a.title ?? 'Flood alert', area: a.area ?? a.location ?? 'Local area', time: a.updatedAt?.toDate ? a.updatedAt.toDate().toLocaleString() : 'Recently updated', tone: a.severity === 'High' ? 'red' : 'amber' }} />) : <div className="rounded-lg border border-dashed border-slate-300 p-5 text-sm text-slate-500">No active flood alerts have been published.</div>}</div></section><p className="mt-7 text-xs text-slate-400">Live records are read from the FloodWatch Firebase project. Empty sections mean no records have been published yet.</p></> }
type AlertView = { severity: string; title: string; area: string; time: string; tone: 'red' | 'amber'; isDemonstration?: boolean; demoLabel?: string }
function AlertCard({ alert }: { alert: AlertView }) { return <article className={`rounded-xl border p-5 ${alert.isDemonstration ? 'border-amber-300 bg-amber-50/40' : 'border-slate-200 bg-white'}`}><div className="flex flex-wrap items-center justify-between gap-2"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${alert.tone === 'red' ? 'bg-red-100 text-[#b51f30]' : 'bg-amber-100 text-amber-800'}`}>{alert.severity}</span>{alert.isDemonstration && <span className="rounded-full bg-amber-200 px-2.5 py-1 text-[10px] font-black tracking-wide text-amber-900">{alert.demoLabel ?? 'DEMONSTRATION DATA — NOT A REAL EMERGENCY'}</span>}<span className="text-xs text-slate-400">{alert.time}</span></div><h3 className="mt-4 font-bold">{alert.title}</h3><p className="mt-1 text-sm text-slate-500">{alert.area}</p></article> }
function AlertsScreen({ state }: { state: FirestoreState<Record<string, any>> }) { if (state.loading) return <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Loading live alerts…</div>; if (state.error) return <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">{state.error}</div>; if (!state.data.length) return <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">No active flood alerts have been published.</div>; return <div className="space-y-4">{state.data.map((a) => <AlertCard key={a.id ?? a.title} alert={{ severity: a.severity ?? 'Advisory', title: a.title ?? 'Flood alert', area: a.area ?? a.location ?? 'Local area', time: a.updatedAt?.toDate ? a.updatedAt.toDate().toLocaleString() : 'Recently updated', tone: a.severity === 'High' ? 'red' : 'amber', isDemonstration: a.isDemonstration === true, demoLabel: a.demoLabel }} />)}</div> }
function MapScreen({ alerts, reports, shelters, resources, states }: { alerts: Record<string, any>[]; reports: Record<string, any>[]; shelters: Record<string, any>[]; resources: Record<string, any>[]; states: FirestoreState<Record<string, any>>[] }) {
  const sources = [
    { kind: 'alert' as const, collection: 'FloodAlerts', data: alerts, label: (record: Record<string, any>) => record.title ?? record.area ?? 'Flood alert' },
    { kind: 'report' as const, collection: 'FloodReports', data: reports, label: (record: Record<string, any>) => record.location ?? 'Flood report' },
    { kind: 'shelter' as const, collection: 'Shelters', data: shelters, label: (record: Record<string, any>) => record.name ?? 'Shelter' },
    { kind: 'resource' as const, collection: 'Resources', data: resources, label: (record: Record<string, any>) => record.name ?? record.title ?? 'Resource' },
  ]
  const received = Object.fromEntries(sources.map((source) => [source.collection, source.data.length]))
  const records = sources.flatMap((source) => source.data.map((record) => ({ ...record, kind: source.kind, label: source.label(record), sourceCollection: source.collection })))
  const positioned = records.map((record) => ({
    ...record,
    latitude: Number(record.latitude ?? record.lat ?? record.coordinates?.latitude),
    longitude: Number(record.longitude ?? record.lng ?? record.coordinates?.longitude),
  })).filter((record) => Number.isFinite(record.latitude) && Number.isFinite(record.longitude) && record.latitude >= -90 && record.latitude <= 90 && record.longitude >= -180 && record.longitude <= 180)
  const validByCollection = Object.fromEntries(sources.map((source) => [source.collection, positioned.filter((record) => record.sourceCollection === source.collection).length]))
  useEffect(() => {
    console.info('[v0] Live map diagnostics', { received, validMarkers: validByCollection })
  }, [alerts, reports, shelters, resources])
  const loading = states.some((state) => state.loading)
  const error = states.find((state) => state.error)?.error
  return <div className="overflow-hidden rounded-xl border border-slate-200 bg-white"><div className="flex flex-wrap gap-4 border-b p-4 text-xs font-semibold"><span><i className="mr-2 inline-block size-3 rounded-full bg-[#b51f30]" />Alert</span><span><i className="mr-2 inline-block size-3 rounded-full bg-[#d9283c]" />Report</span><span><i className="mr-2 inline-block size-3 rounded-full bg-[#245483]" />Shelter</span><span><i className="mr-2 inline-block size-3 rounded-full bg-[#15803d]" />Resource</span></div><div className="border-b bg-slate-50 px-4 py-2 text-xs text-slate-600">Received: {sources.map((source) => `${source.collection} ${received[source.collection]}`).join(' · ')}. Valid markers: {sources.map((source) => `${source.kind} ${validByCollection[source.collection]}`).join(' · ')}</div>{loading && <div className="border-b bg-blue-50 px-4 py-2 text-xs text-blue-800">Loading live records…</div>}{error && <div className="border-b bg-amber-50 px-4 py-2 text-xs text-amber-800">{error}</div>}{!loading && !positioned.length && <div className="border-b bg-slate-50 px-4 py-3 text-sm text-slate-600">No valid location data is available for the current account.</div>}<LiveMap records={positioned} /></div>
  }
function ShelterScreen({ query, setQuery, shelters, state }: { query: string; setQuery: (q: string) => void; shelters: Record<string, any>[]; state: FirestoreState<Record<string, any>> }) { if (state.loading) return <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Loading live shelters…</div>; if (state.error) return <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">{state.error}</div>; return <><div className="relative mb-5"><Search className="absolute left-3 top-3 size-4 text-slate-400" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search shelters by name or area" className="w-full rounded-lg border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm outline-none focus:border-[#245483]" /></div><div className="grid gap-4 lg:grid-cols-2">{shelters.map((s) => <article key={s.name} className="rounded-xl border border-slate-200 bg-white p-5"><div className="flex justify-between gap-4"><div><h3 className="font-bold">{s.name}</h3><p className="mt-1 text-sm text-slate-500">{s.address}</p></div><span className={`h-fit rounded-full px-2.5 py-1 text-xs font-bold ${s.status === 'Open' ? 'bg-emerald-100 text-emerald-700' : s.status === 'Full' ? 'bg-slate-100 text-slate-500' : 'bg-amber-100 text-amber-800'}`}>{s.status}</span></div><div className="mt-5 flex items-end justify-between"><div><strong className="text-2xl">{s.available}</strong><span className="text-sm text-slate-500"> / {s.capacity} places available</span></div><a href={`https://www.openstreetmap.org/search?query=${encodeURIComponent(s.address)}`} target="_blank" rel="noreferrer" className="text-sm font-bold text-[#245483]">Get directions</a></div></article>)}</div>{!shelters.length && <p className="mt-5 rounded-lg border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500">No shelters are currently listed.</p>}</> }
function ReportScreen({ onSubmit, user, onSignIn }: { onSubmit: (f: FormData) => void; user: any; onSignIn: () => void }) { return <div className="max-w-2xl rounded-xl border border-slate-200 bg-white p-6"><div className="mb-6 rounded-lg bg-[#eaf1fa] p-4 text-sm text-slate-600"><strong className="text-[#071d3b]">Submit a clear report.</strong> Reports are marked Pending until reviewed by a coordinator. For immediate danger, call emergency services.</div>{!user && <button onClick={onSignIn} className="mb-5 flex items-center gap-2 rounded-lg bg-[#071d3b] px-4 py-3 text-sm font-bold text-white">Sign in to report <LogIn className="size-4" /></button>}<form action={onSubmit} className="space-y-5"><label className="block text-sm font-semibold">Location<input name="location" required placeholder="Street, landmark, or neighborhood" className="mt-2 w-full rounded-lg border p-3 font-normal" /></label><label className="block text-sm font-semibold">Water level<select name="waterLevel" required className="mt-2 w-full rounded-lg border p-3 font-normal"><option value="low">Low: ankle height</option><option value="medium">Medium: knee height</option><option value="high">High: waist height or above</option></select></label><label className="block text-sm font-semibold">What is happening?<textarea name="description" required minLength={10} rows={4} placeholder="Describe the flooding and access conditions" className="mt-2 w-full rounded-lg border p-3 font-normal" /></label><label className="flex items-center gap-3 text-sm font-semibold"><input type="checkbox" name="needsHelp" className="size-4" />People need help at this location</label><label className="block text-sm font-semibold">Number of people needing help<input name="peopleCount" type="number" min="0" max="1000" defaultValue="0" className="mt-2 w-full rounded-lg border p-3 font-normal" /></label><label className="block text-sm font-semibold">Requested resources<span className="mt-1 block text-xs font-normal text-slate-500">Separate items with commas</span><input name="resources" placeholder="Water, blankets, transport" className="mt-2 w-full rounded-lg border p-3 font-normal" /></label><label className="block text-sm font-semibold">Photo (optional)<span className="mt-2 flex items-center gap-2 rounded-lg border border-dashed p-4 text-sm font-normal text-slate-500"><Upload className="size-4" /><input name="photo" type="file" accept="image/jpeg,image/png,image/webp" /></span><span className="mt-1 block text-xs font-normal text-slate-400">Images must be JPG, PNG, or WebP under 5MB.</span></label><button type="submit" className="w-full rounded-lg bg-[#d9283c] py-3 text-sm font-bold text-white">Submit report</button></form></div> }
function AdminScreen({ user, reports, shelters, onSignIn }: { user: any; reports: Record<string, any>[]; shelters: Record<string, any>[]; onSignIn: () => void }) { if (!user || user.role !== 'administrator') return <div className="rounded-xl border border-slate-200 bg-white p-8 text-center"><ShieldCheck className="mx-auto mb-4 size-10 text-[#d9283c]" /><h2 className="text-xl font-bold">Coordination desk</h2><p className="mx-auto mt-2 max-w-md text-sm text-slate-500">This area is protected by Firebase custom claims. Sign in with an administrator account to continue.</p><button onClick={onSignIn} className="mt-5 rounded-lg bg-[#071d3b] px-4 py-3 text-sm font-bold text-white">Sign in</button></div>; return <div className="grid gap-5 md:grid-cols-3"><Stat icon={List} value={String(reports.filter((report) => report.status === 'Pending').length)} label="Pending reports" color="red" /><Stat icon={CheckCircle2} value={String(reports.filter((report) => report.status === 'Verified').length)} label="Verified reports" /><Stat icon={Users} value={String(shelters.length)} label="Shelter partners" /><div className="md:col-span-3 rounded-xl border border-slate-200 bg-white p-6"><h2 className="text-lg font-bold">Review queue</h2><p className="mt-2 text-sm text-slate-500">Firestore-backed report review controls appear here for administrators. This signed-in preview is still limited to citizen claims until a trusted administrator claim is provisioned.</p></div></div> }
function AuthModal({ mode, setMode, onClose, onSubmit, pending, error }: { mode: 'login' | 'register'; setMode: (m: 'login' | 'register') => void; onClose: () => void; onSubmit: (f: FormData) => Promise<void>; pending: boolean; error: string }) { return <div className="fixed inset-0 z-50 grid place-items-center bg-[#071d3b]/70 p-5"><div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl"><div className="mb-6 flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-widest text-[#d9283c]">FloodWatch</p><h2 className="mt-1 text-2xl font-bold">{mode === 'login' ? 'Welcome back' : 'Create your account'}</h2></div><button type="button" onClick={onClose} aria-label="Close"><X /></button></div>{error && <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}<form onSubmit={async (event) => { event.preventDefault(); await onSubmit(new FormData(event.currentTarget)) }} className="space-y-4"><label className="block text-sm font-semibold">Email<input name="email" type="email" required className="mt-2 w-full rounded-lg border p-3 font-normal" /></label><label className="block text-sm font-semibold">Password<input name="password" type="password" required minLength={6} className="mt-2 w-full rounded-lg border p-3 font-normal" /></label><button type="submit" disabled={pending} className="w-full rounded-lg bg-[#071d3b] py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60">{pending ? 'Working…' : mode === 'login' ? 'Sign in' : 'Create citizen account'}</button></form><p className="mt-5 text-center text-sm text-slate-500">{mode === 'login' ? 'New to FloodWatch?' : 'Already registered?'} <button type="button" onClick={() => setMode(mode === 'login' ? 'register' : 'login')} className="font-bold text-[#245483]">{mode === 'login' ? 'Create an account' : 'Sign in'}</button></p><p className="mt-4 text-center text-xs text-slate-400">Registration can only create citizen accounts. Administrator access requires a trusted Firebase custom claim.</p></div></div> }
