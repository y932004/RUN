/* 共用 Firebase 工具 (ES module) */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  runTransaction,
  collection,
  addDoc,
  serverTimestamp,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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
  return snap.data().coins || 0;
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
