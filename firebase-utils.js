/* 共用 Firebase 工具 (ES module) */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  runTransaction,
  collection,
  addDoc,
  serverTimestamp,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getDocs, query, where, orderBy, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyB9dkg-ZKdgU9rNur3XodRYSnBZkHfldGI",
  authDomain: "runrun-21a19.firebaseapp.com",
  projectId: "runrun-21a19",
  storageBucket: "runrun-21a19.firebasestorage.app",
  messagingSenderId: "57222188374",
  appId: "1:57222188374:web:ea4bf396424bdbca9d9af7",
  measurementId: "G-PS1B2X8NS2"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// onAuth(callback(user|null)) 簡化用戶狀態處理
export function onAuth(cb) {
  return onAuthStateChanged(auth, cb);
}

export async function getCoins(uid) {
  if (!uid) throw new Error('no-uid');
  const docRef = doc(db, 'users', uid);
  const snap = await getDoc(docRef);
  if (!snap.exists()) return 0;
  const data = snap.data();
  // 如果 coins 欄位不存在，將使用者 coins 初始化為 800（向後相容且避免顯示 0）
  if (typeof data.coins === 'number') return data.coins;
  try {
    await updateDoc(docRef, { coins: 800 });
    return 800;
  } catch (e) {
    console.warn('init coins failed', e);
    return 0;
  }
}

export async function getOwnedItems(uid) {
  if (!uid) throw new Error('no-uid');
  const docRef = doc(db, 'users', uid);
  const snap = await getDoc(docRef);
  if (!snap.exists()) return [];
  return snap.data().ownedItems || [];
}

export async function getUserProfile(uid) {
  if (!uid) throw new Error('no-uid');
  const docRef = doc(db, 'users', uid);
  const snap = await getDoc(docRef);
  if (!snap.exists()) return null;
  return snap.data();
}

// 取得 transactions（購買/獎勵紀錄），按時間降序
export async function getTransactions(uid, limit = 50) {
  if (!uid) throw new Error('no-uid');
  const col = collection(db, 'users', uid, 'transactions');
  const q = query(col, orderBy('createdAt', 'desc'));
  const snaps = await getDocs(q);
  return snaps.docs.map(d => ({ id: d.id, ...d.data() }));
}

// 追蹤使用者 document（即時更新）
export function watchUserDoc(uid, onChange) {
  if (!uid) throw new Error('no-uid');
  const ref = doc(db, 'users', uid);
  return onSnapshot(ref, (snap) => {
    if (!snap.exists()) return onChange(null);
    onChange(snap.data());
  });
}

// 新增運動報告至 users/{uid}/sportReports
export async function addSportReport(uid, report) {
  if (!uid) throw new Error('no-uid');
  const col = collection(db, 'users', uid, 'sportReports');
  const docRef = await addDoc(col, { ...report, createdAt: serverTimestamp() });
  return docRef.id;
}

// 查找使用者 (透過 email)
export async function findUserByEmail(email) {
  const usersCol = collection(db, 'users');
  const q = query(usersCol, where('email', '==', email));
  const snaps = await getDocs(q);
  if (snaps.empty) return null;
  const d = snaps.docs[0];
  return { uid: d.id, ...d.data() };
}

// 新增擁有物品（如果尚未擁有）
export async function addOwnedItem(uid, itemId, meta = {}) {
  if (!uid) throw new Error('no-uid');
  const userRef = doc(db, 'users', uid);

  const updated = await runTransaction(db, async (t) => {
    const snap = await t.get(userRef);
    if (!snap.exists()) throw new Error('user-not-found');
    const arr = snap.data().ownedItems || [];
    if (arr.includes(itemId)) return arr;
    const next = arr.concat([itemId]);
    t.update(userRef, { ownedItems: next });
    return next;
  });

  // 可選：也在 transactions 記錄 item 購買（spendCoins 已做）
  return updated;
}

// 更新 user doc 任意欄位（例如 equippedScene / equippedSkin）
export async function updateUserField(uid, field, value) {
  if (!uid) throw new Error('no-uid');
  const userRef = doc(db, 'users', uid);
  await updateDoc(userRef, { [field]: value });
}

// 增加金幣（例如遊戲獎勵）- 回傳更新後餘額
export async function addCoins(uid, amount, description = '') {
  if (!uid) throw new Error('no-uid');
  const userRef = doc(db, 'users', uid);

  const newBalance = await runTransaction(db, async (t) => {
    const snap = await t.get(userRef);
    if (!snap.exists()) throw new Error('user-not-found');
    const old = snap.data().coins || 0;
    const next = old + amount;
    t.update(userRef, { coins: next });
    return next;
  });

  // non-transactional: 記錄交易紀錄（在 subcollection）
  try {
    await addDoc(collection(db, 'users', uid, 'transactions'), {
      type: 'reward',
      amount,
      description,
      balanceAfter: newBalance,
      createdAt: serverTimestamp(),
    });
  } catch (e) {
    console.error('record transaction failed', e);
  }

  return newBalance;
}

// 扣除金幣（購買）- 回傳更新後餘額
export async function spendCoins(uid, amount, description = '') {
  if (!uid) throw new Error('no-uid');
  const userRef = doc(db, 'users', uid);

  // 先檢查文件是否存在，若不存在則初始化（防禦性措施）
  try {
    const snap = await getDoc(userRef);
    if (!snap.exists()) {
      console.warn('user doc not found, initializing:', uid);
      // 新使用者預設金幣為 800
      await setDoc(userRef, { coins: 800, ownedItems: [] }, { merge: true });
    } else if (typeof snap.data().coins === 'undefined') {
      // 若文件存在但缺少 coins 欄位，補上預設值以避免被視為 0
      try { await updateDoc(userRef, { coins: 800 }); } catch(e){ console.warn('set default coins failed', e); }
    }
  } catch (e) {
    console.error('pre-check failed:', e);
  }

  const newBalance = await runTransaction(db, async (t) => {
    const snap = await t.get(userRef);
    if (!snap.exists()) throw new Error('user-not-found');
    const old = snap.data().coins || 0;
    if (old < amount) throw new Error('insufficient-funds');
    const next = old - amount;
    t.update(userRef, { coins: next });
    return next;
  });

  try {
    await addDoc(collection(db, 'users', uid, 'transactions'), {
      type: 'purchase',
      amount,
      description,
      balanceAfter: newBalance,
      createdAt: serverTimestamp(),
    });
  } catch (e) {
    console.error('record transaction failed', e);
  }

  return newBalance;
}

export { auth, db };
