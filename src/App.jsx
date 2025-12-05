import { useState, useEffect, useRef } from 'react';
import { auth, db, initializeAuth } from './firebase.jsx';
import { 
  collection, addDoc, onSnapshot, query, serverTimestamp, setDoc, doc, updateDoc, deleteDoc
} from 'firebase/firestore';

// --- ENCRYPTION LOGIC ---
const xorEncrypt = (str, key) => {
  let output = '';
  for (let i = 0; i < str.length; i++) {
    const keyChar = key.charCodeAt(i % key.length);
    const encryptedChar = str.charCodeAt(i) ^ keyChar;
    output += String.fromCharCode(encryptedChar);
  }
  const encoded = new TextEncoder().encode(output);
  return btoa(String.fromCharCode.apply(null, encoded));
};

const xorDecrypt = (base64Str, key) => {
  try {
    const binaryStr = atob(base64Str);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    const decodedStr = new TextDecoder().decode(bytes);
    let output = '';
    for (let i = 0; i < decodedStr.length; i++) {
      const keyChar = key.charCodeAt(i % key.length);
      const decryptedChar = decodedStr.charCodeAt(i) ^ keyChar;
      output += String.fromCharCode(decryptedChar);
    }
    return output;
  } catch (e) {
    return base64Str;
  }
};

const isOnlyEmojis = (str) => {
  const emojiRegex = /(\p{Emoji_Presentation}|\p{Emoji}\uFE0F|\u200D|[\d%.\-+])+/gu;
  return str.trim().length > 0 && str.replace(emojiRegex, '').trim().length === 0;
};

export default function TradingSignalsChat() {
  const [currentRoom, setCurrentRoom] = useState(null);
  const [roomInput, setRoomInput] = useState('');
  const [nickname, setNickname] = useState('');
  const [userId, setUserId] = useState('');
  const [userStatus, setUserStatus] = useState('online');
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [isNicknameModalOpen, setIsNicknameModalOpen] = useState(false);
  const [modalInput, setModalInput] = useState('');
  const [notification, setNotification] = useState(null);
  const [loading, setLoading] = useState(true);
  const [roomUsers, setRoomUsers] = useState([]);
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editingText, setEditingText] = useState('');
  const messagesEndRef = useRef(null);

  // Initialize Firebase Auth
  useEffect(() => {
    initializeAuth().then(() => {
      const unsubscribe = auth.onAuthStateChanged((user) => {
        if (user) {
          setUserId(user.uid);
          setLoading(false);
        }
      });
      return () => unsubscribe();
    });
  }, []);

  // Update user status
  useEffect(() => {
    if (!userId || !currentRoom || !nickname) return;
    const userRef = doc(db, `rooms/${currentRoom}/users`, userId);
    setDoc(userRef, {
      userId,
      nickname,
      status: userStatus,
      lastSeen: serverTimestamp()
    }, { merge: true });
  }, [userId, currentRoom, userStatus, nickname]);

  // Listen to room users
  useEffect(() => {
    if (!currentRoom) return;
    const usersRef = collection(db, `rooms/${currentRoom}/users`);
    const unsubscribe = onSnapshot(usersRef, (snapshot) => {
      const users = snapshot.docs.map(doc => doc.data());
      setRoomUsers(users);
    });
    return () => unsubscribe();
  }, [currentRoom]);

  // Listen to messages
  useEffect(() => {
    if (!userId || !currentRoom) return;
    const messagesRef = collection(db, `rooms/${currentRoom}/messages`);
    const q = query(messagesRef);
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedMessages = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      fetchedMessages.sort((a, b) => {
        const tsA = a.timestamp?.toMillis() || 0;
        const tsB = b.timestamp?.toMillis() || 0;
        return tsA - tsB;
      });
      setMessages(fetchedMessages);
    });
    return () => unsubscribe();
  }, [userId, currentRoom]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const saveNickname = () => {
    if (!modalInput.trim() || modalInput.trim().length < 2) {
      setNotification({ type: 'error', message: 'Nickname must be 2+ characters!' });
      setTimeout(() => setNotification(null), 3000);
      return;
    }
    setNickname(modalInput.trim());
    setIsNicknameModalOpen(false);
    setModalInput('');
    setNotification({ type: 'success', message: `Trader ID: ${modalInput} 🚀` });
    setTimeout(() => setNotification(null), 3000);
  };

  const joinRoom = () => {
    if (!roomInput.trim()) {
      setNotification({ type: 'error', message: 'Enter a room code!' });
      setTimeout(() => setNotification(null), 3000);
      return;
    }
    if (!nickname) {
      setNotification({ type: 'error', message: 'Set your identity first! 📛' });
      setIsNicknameModalOpen(true);
      return;
    }
    setCurrentRoom(roomInput.toUpperCase());
    setMessages([]);
    setNotification({ type: 'success', message: `Joined: ${roomInput.toUpperCase()} 📊` });
    setTimeout(() => setNotification(null), 3000);
  };

  const leaveRoom = () => {
    setCurrentRoom(null);
    setMessages([]);
    setRoomUsers([]);
    setRoomInput('');
  };

  const sendMessage = async () => {
    if (!newMessage.trim()) return;
    if (!isOnlyEmojis(newMessage)) {
      setNotification({ type: 'error', message: '❌ Signals only (emojis & numbers)! 🔒' });
      setTimeout(() => setNotification(null), 3000);
      return;
    }

    try {
      const messagesRef = collection(db, `rooms/${currentRoom}/messages`);
      const encryptedContent = xorEncrypt(newMessage.trim(), currentRoom);
      await addDoc(messagesRef, {
        userId,
        userNickname: nickname,
        encryptedContent: encryptedContent,
        timestamp: serverTimestamp()
      });
      setNewMessage('');
    } catch (error) {
      console.error('Error sending message:', error);
      setNotification({ type: 'error', message: 'Failed to send signal' });
      setTimeout(() => setNotification(null), 3000);
    }
  };

  const editMessage = async (msgId) => {
    if (!editingText.trim() || !isOnlyEmojis(editingText)) {
      setNotification({ type: 'error', message: 'Emojis & numbers only!' });
      setTimeout(() => setNotification(null), 3000);
      return;
    }

    try {
      const msgRef = doc(db, `rooms/${currentRoom}/messages`, msgId);
      const encryptedContent = xorEncrypt(editingText.trim(), currentRoom);
      await updateDoc(msgRef, {
        encryptedContent: encryptedContent,
        edited: true,
        editedAt: serverTimestamp()
      });
      setEditingMessageId(null);
      setEditingText('');
      setNotification({ type: 'success', message: 'Signal updated!' });
      setTimeout(() => setNotification(null), 3000);
    } catch (error) {
      setNotification({ type: 'error', message: 'Failed to edit' });
      setTimeout(() => setNotification(null), 3000);
    }
  };

  const deleteMessage = async (msgId) => {
    try {
      await deleteDoc(doc(db, `rooms/${currentRoom}/messages`, msgId));
      setNotification({ type: 'success', message: 'Signal deleted' });
      setTimeout(() => setNotification(null), 3000);
    } catch (error) {
      setNotification({ type: 'error', message: 'Failed to delete' });
      setTimeout(() => setNotification(null), 3000);
    }
  };

  const signalEmojis = [
    '🟢', '🔴', '⏸️', '📈', '📉', '⬆️', '⬇️', '🚀',
    '🔥', '⚡', '💰', '💵', '💳', '🏦', '🪙', '₿',
    '✅', '❌', '⚠️', '🔔', '💎', '📊', '🕯️', '⛓️'
  ];

  const hotSignals = [
    { emoji: '🟢📈5%', label: '🟢📈5%' },
    { emoji: '🔴⬇️-3%💰', label: '🔴⬇️-3%' },
    { emoji: '🔥⚡💳', label: '🔥⚡💳' },
    { emoji: '🕯️📊20%₿', label: '🕯️📊20%' },
    { emoji: '⚠️🔔💎', label: '⚠️🔔💎' },
    { emoji: '🚀⬆️✅', label: '🚀⬆️✅' },
    { emoji: '❌⬇️🔴', label: '❌⬇️🔴' },
    { emoji: '⏸️📈💰', label: '⏸️📈💰' }
  ];

  const getStatusEmoji = (status) => {
    switch(status) {
      case 'online': return '🟢';
      case 'away': return '🟡';
      case 'offline': return '⚫';
      default: return '⚫';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-gray-950 via-emerald-950 to-black">
        <p className="text-xl font-medium text-amber-400">📊 Loading signals... 🔗</p>
      </div>
    );
  }

  // Room Selection Screen
  if (!currentRoom) {
    return (
      <div className="flex flex-col h-screen max-h-screen bg-gradient-to-br from-gray-950 via-emerald-950 to-black">
        {notification && (
          <div className={`fixed top-4 right-4 z-50 p-4 rounded-lg shadow-xl text-white max-w-sm ${
            notification.type === 'success' ? 'bg-green-600' : 'bg-red-600'
          }`}>
            <p className="font-bold">{notification.message}</p>
          </div>
        )}

        <div className="flex items-center justify-center min-h-screen p-4">
          <div className="bg-gray-950 rounded-2xl shadow-2xl p-8 w-full max-w-md border-2 border-amber-500">
            <h1 className="text-4xl font-extrabold text-center text-amber-400 mb-2">
              📊 TRADING SIGNALS 💹
            </h1>
            <p className="text-center text-emerald-300 mb-2 font-mono text-sm">Crypto • Stocks • Bonds • Blockchain • Forex • Commodities</p>
            <p className="text-center text-emerald-200 mb-8 font-mono text-xs">Professional Encrypted Trading Rooms</p>

            {!nickname && (
              <div className="mb-6">
                <button
                  onClick={() => setIsNicknameModalOpen(true)}
                  className="w-full bg-amber-600 hover:bg-amber-700 text-white font-bold py-3 px-4 rounded-xl transition border-2 border-amber-500"
                >
                  🎯 Set Trader ID
                </button>
              </div>
            )}

            {nickname && (
              <div className="mb-6 p-3 bg-emerald-950 rounded-lg border-2 border-emerald-600">
                <p className="text-xs text-emerald-400 mb-1">YOUR ID:</p>
                <p className="text-lg font-bold text-amber-400 font-mono">{nickname}</p>
              </div>
            )}

            <div className="space-y-3 mb-6">
              <label className="block text-sm font-medium text-amber-400 font-mono">TRADING ROOM</label>
              <p className="text-xs text-emerald-400 mb-2">Examples: BTC, AAPL, BOND-10Y, ETH-DEFI, EURUSD, GOLD, SPY</p>
              <input
                type="text"
                value={roomInput}
                onChange={(e) => setRoomInput(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && joinRoom()}
                placeholder="e.g., AAPL-STOCKS or BTC-CRYPTO"
                maxLength={20}
                className="w-full p-3 border-2 border-emerald-600 rounded-lg focus:border-amber-500 focus:outline-none text-lg font-bold bg-gray-900 text-amber-400"
              />
              <p className="text-xs text-emerald-400">Join a private trading room for any asset class</p>
            </div>

            <button
              onClick={joinRoom}
              disabled={!nickname || !roomInput.trim()}
              className={`w-full py-3 rounded-xl font-bold text-white transition border-2 ${
                !nickname || !roomInput.trim()
                  ? 'bg-gray-800 border-gray-700 cursor-not-allowed'
                  : 'bg-emerald-700 hover:bg-emerald-800 border-emerald-600 shadow-lg'
              }`}
            >
              📈 ENTER ROOM
            </button>

            {nickname && (
              <button
                onClick={() => setIsNicknameModalOpen(true)}
                className="w-full mt-3 bg-gray-800 hover:bg-gray-700 text-emerald-400 font-semibold py-2 px-4 rounded-lg transition border border-emerald-600"
              >
                Change ID
              </button>
            )}
          </div>
        </div>

        {isNicknameModalOpen && (
          <div className="fixed inset-0 bg-gray-900 bg-opacity-95 flex items-center justify-center z-40 p-4">
            <div className="bg-gray-950 rounded-xl shadow-2xl w-full max-w-sm p-6 border-2 border-amber-500">
              <h2 className="text-xl font-bold text-amber-400 border-b border-amber-500 pb-3 mb-4">🎯 SET TRADER ID</h2>
              <input
                type="text"
                value={modalInput}
                onChange={(e) => setModalInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && saveNickname()}
                maxLength={15}
                className="w-full p-3 border-2 border-emerald-600 rounded-lg focus:outline-none text-lg font-bold bg-gray-900 text-amber-400 mb-4"
                placeholder="TRADER123"
                autoFocus
              />
              <div className="flex justify-end space-x-3 mt-4">
                <button
                  onClick={() => setIsNicknameModalOpen(false)}
                  className="px-4 py-2 bg-gray-800 text-emerald-400 rounded-lg hover:bg-gray-700 border border-emerald-600"
                >
                  Cancel
                </button>
                <button
                  onClick={saveNickname}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-semibold"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

 (
    <div className="flex flex-col h-screen max-h-screen bg-gray-950 font-mono text-amber-400">
      {/* Left Sidebar - 8 Hot Buttons */}
      <div className="w-32 bg-gray-900 border-r-2 border-emerald-600 p-3 overflow-y-auto flex flex-col gap-2">
        <p className="text-xs font-bold text-emerald-400 mb-2">HOT SIGNALS</p>
        {hotSignals.map((sig, idx) => (
          <button
            key={idx}
            onClick={() => setNewMessage(sig.emoji)}
            className={`px-2 py-3 bg-gradient-to-r from-gray-800 to-emerald-900 hover:from-emerald-800 hover:to-emerald-700 text-amber-400 font-bold rounded-lg border-2 border-emerald-600 text-xs transition transform hover:scale-105 animate-pulse`}
            style={{
              animationDelay: `${idx * 0.1}s`,
              animation: `pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite`,
              animationDelay: `${idx * 0.15}s`
            }}
            title={sig.emoji}
          >
            {sig.label}
          </button>
        ))}
      </div>

      {/* Main Content */}
      <div className="flex flex-col flex-1">{notification && (
        <div className={`fixed top-4 right-4 z-50 p-4 rounded-lg shadow-xl text-white max-w-sm ${
          notification.type === 'success' ? 'bg-green-600' : 'bg-red-600'
        }`}>
          <p className="font-bold">{notification.message}</p>
        </div>
      )}

      {/* Header */}
      <header className="p-4 border-b-2 border-emerald-600 bg-gray-900 shadow-lg z-10">
        <div className="flex justify-between items-center mb-3">
          <div>
            <h1 className="text-2xl font-extrabold text-amber-400">📊 {currentRoom} 💼</h1>
            <p className="text-sm text-emerald-400">Trader: {nickname} | Any Asset Class</p>
          </div>
          <div className="flex items-center space-x-2">
            <select
              value={userStatus}
              onChange={(e) => setUserStatus(e.target.value)}
              className="px-3 py-2 bg-gray-800 rounded-lg text-sm font-semibold text-amber-400 border-2 border-emerald-600"
            >
              <option value="online">🟢 ONLINE</option>
              <option value="away">🟡 AWAY</option>
              <option value="offline">⚫ OFFLINE</option>
            </select>
            <button
              onClick={leaveRoom}
              className="px-4 py-2 bg-red-700 hover:bg-red-800 text-white font-bold rounded-lg border-2 border-red-600"
            >
              EXIT
            </button>
          </div>
        </div>

        {/* Online Users */}
        <div className="bg-gray-800 p-3 rounded-lg border-2 border-emerald-600">
          <p className="text-xs font-semibold text-emerald-400 mb-2">ACTIVE TRADERS ({roomUsers.length}):</p>
          <div className="flex flex-wrap gap-2">
            {roomUsers.map((user) => (
              <div key={user.userId} className="bg-gray-900 px-3 py-1 rounded-full text-sm flex items-center space-x-1 border-2 border-emerald-600">
                <span>{getStatusEmoji(user.status)}</span>
                <span className="font-semibold text-amber-400">{user.nickname}</span>
              </div>
            ))}
          </div>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-grow p-4 overflow-y-auto space-y-3 bg-gray-950">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-700">
            <span className="text-6xl mb-3">📊</span>
            <p className="text-xl font-medium text-emerald-600">No signals yet</p>
            <p className="text-sm text-emerald-500">Share encrypted trading signals below</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMine = msg.userId === userId;
            const decryptedContent = msg.encryptedContent 
              ? xorDecrypt(msg.encryptedContent, currentRoom)
              : msg.content || '';
            
            return (
              <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-xs p-3 rounded-lg border-2 ${
                  isMine
                    ? 'bg-gray-900 border-amber-500 rounded-br-none'
                    : 'bg-gray-900 border-emerald-600 rounded-tl-none'
                }`}>
                  <div className="text-xs font-semibold mb-1 text-emerald-400">{isMine ? 'YOU' : msg.userNickname}</div>
                  
                  {editingMessageId === msg.id ? (
                    <div className="flex gap-2 mb-2">
                      <input
                        type="text"
                        value={editingText}
                        onChange={(e) => setEditingText(e.target.value)}
                        className="flex-grow p-2 bg-gray-800 border-2 border-emerald-600 rounded text-amber-400"
                      />
                      <button
                        onClick={() => editMessage(msg.id)}
                        className="px-2 py-1 bg-green-700 text-white text-xs rounded font-bold"
                      >
                        ✓
                      </button>
                      <button
                        onClick={() => setEditingMessageId(null)}
                        className="px-2 py-1 bg-red-700 text-white text-xs rounded font-bold"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="text-3xl leading-snug break-words mb-2 text-amber-400">{decryptedContent}</div>
                      <div className="flex justify-between items-center text-xs text-gray-600">
                        <span>{msg.timestamp ? new Date(msg.timestamp.toMillis()).toLocaleTimeString() : 'pending'}</span>
                        {isMine && (
                          <div className="flex gap-1">
                            <button
                              onClick={() => {
                                setEditingMessageId(msg.id);
                                setEditingText(decryptedContent);
                              }}
                              className="text-blue-400 hover:text-blue-300 font-bold"
                            >
                              ✏️
                            </button>
                            <button
                              onClick={() => deleteMessage(msg.id)}
                              className="text-red-400 hover:text-red-300 font-bold"
                            >
                              🗑️
                            </button>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Bottom Input Area */}
      <footer className="p-4 border-t-2 border-emerald-600 bg-gray-900 shadow-2xl z-10">
        {/* Signal Emojis */}
        <div className="mb-3 flex flex-wrap gap-1">
          {signalEmojis.map(emoji => (
            <button
              key={emoji}
              onClick={() => setNewMessage(prev => prev + emoji)}
              className="text-xl p-1 rounded-lg bg-gray-800 hover:bg-emerald-900 border border-emerald-600 transition transform hover:scale-110"
              title={`Add ${emoji}`}
            >
              {emoji}
            </button>
          ))}
        </div>

        {/* Number Pad */}
        <div className="mb-3 grid grid-cols-5 gap-1">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '%', '.', '-', '+', 'DEL'].map(num => (
            <button
              key={num}
              onClick={() => {
                if (num === 'DEL') {
                  setNewMessage(prev => prev.slice(0, -1));
                } else {
                  setNewMessage(prev => prev + num);
                }
              }}
              className={`px-2 py-1 text-sm font-bold rounded border-2 transition ${
                num === 'DEL'
                  ? 'bg-red-700 hover:bg-red-800 border-red-600 text-white'
                  : 'bg-gray-800 hover:bg-gray-700 border-emerald-600 text-amber-400'
              }`}
            >
              {num}
            </button>
          ))}
        </div>

        {/* Message Input */}
        <div className="flex space-x-2">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
            placeholder="Send signal... 🔒"
            className="flex-grow p-3 border-2 border-emerald-600 rounded-lg focus:border-amber-500 focus:outline-none bg-gray-900 text-amber-400 font-bold"
            style={{ height: '48px' }}
          />
          <button
            onClick={sendMessage}
            disabled={!newMessage.trim() || !isOnlyEmojis(newMessage)}
            className={`px-4 py-3 rounded-lg font-bold transition border-2 ${
              !newMessage.trim() || !isOnlyEmojis(newMessage)
                ? 'bg-gray-800 border-gray-700 cursor-not-allowed text-gray-500'
                : 'bg-emerald-700 hover:bg-emerald-800 border-emerald-600 text-white shadow-lg'
            }`}
          >
            SEND 📤
          </button>
        </div>
      </footer>
      </div>
    </div>
  );
}