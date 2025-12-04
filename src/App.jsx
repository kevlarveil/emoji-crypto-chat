import { useState, useEffect, useRef } from 'react';
import { auth, db, initializeAuth } from './firebase.jsx';
import { 
  collection, addDoc, onSnapshot, query, serverTimestamp, setDoc, doc 
} from 'firebase/firestore';

// --- ENCRYPTION LOGIC (Symmetric XOR Cipher) ---
const xorEncrypt = (str, key) => {
  let output = '';
  for (let i = 0; i < str.length; i++) {
    const keyChar = key.charCodeAt(i % key.length);
    const encryptedChar = str.charCodeAt(i) ^ keyChar;
    output += String.fromCharCode(encryptedChar);
  }
  // Base64 encode for safe storage in Firestore
  return btoa(output);
};

// --- ENCRYPTION LOGIC (Symmetric XOR Cipher with UTF-8) ---
const xorEncrypt = (str, key) => {
  let output = '';
  for (let i = 0; i < str.length; i++) {
    const keyChar = key.charCodeAt(i % key.length);
    const encryptedChar = str.charCodeAt(i) ^ keyChar;
    output += String.fromCharCode(encryptedChar);
  }
  // Use TextEncoder for UTF-8 support, then Base64 encode
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

export default function EmojiCryptoChat() {
  const [nickname, setNickname] = useState('');
  const [userId, setUserId] = useState('');
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [isNicknameModalOpen, setIsNicknameModalOpen] = useState(false);
  const [modalInput, setModalInput] = useState('');
  const [notification, setNotification] = useState(null);
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef(null);

  // Encryption key based on project ID
  const encryptionKey = 'crypto-money-talk';

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

  // Listen to messages from Firestore
  useEffect(() => {
    if (!userId) return;

    const messagesRef = collection(db, 'emoji_chat_messages');
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
  }, [userId]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const isOnlyEmojis = (str) => {
    const emojiRegex = /(\p{Emoji_Presentation}|\p{Emoji}\uFE0F|\u200D)+/gu;
    return str.trim().length > 0 && str.replace(emojiRegex, '').trim().length === 0;
  };

  const saveNickname = async () => {
    if (!modalInput.trim() || modalInput.trim().length < 2) {
      setNotification({ type: 'error', message: 'Nickname must be 2+ characters!' });
      setTimeout(() => setNotification(null), 3000);
      return;
    }

    try {
      const profileRef = doc(db, 'emoji_chat_users', userId);
      await setDoc(profileRef, {
        userId,
        nickname: modalInput.trim(),
        lastUpdate: serverTimestamp()
      }, { merge: true });

      setNickname(modalInput.trim());
      setIsNicknameModalOpen(false);
      setModalInput('');
      setNotification({ type: 'success', message: `Identity set to "${modalInput}"! 🚀` });
      setTimeout(() => setNotification(null), 3000);
    } catch (error) {
      console.error('Error saving nickname:', error);
      setNotification({ type: 'error', message: 'Failed to save nickname' });
      setTimeout(() => setNotification(null), 3000);
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim()) {
      setNotification({ type: 'error', message: 'Message cannot be empty!' });
      setTimeout(() => setNotification(null), 3000);
      return;
    }

    if (!isOnlyEmojis(newMessage)) {
      setNotification({ type: 'error', message: '❌ Only emojis allowed! 🔒' });
      setTimeout(() => setNotification(null), 3000);
      return;
    }

    if (!nickname) {
      setNotification({ type: 'error', message: 'Set your identity first! 📛' });
      setIsNicknameModalOpen(true);
      setTimeout(() => setNotification(null), 4000);
      return;
    }

    try {
      const messagesRef = collection(db, 'emoji_chat_messages');
      const encryptedContent = xorEncrypt(newMessage.trim(), encryptionKey);
      
      await addDoc(messagesRef, {
        userId,
        userNickname: nickname,
        encryptedContent: encryptedContent,
        timestamp: serverTimestamp()
      });
      setNewMessage('');
    } catch (error) {
      console.error('Error sending message:', error);
      setNotification({ type: 'error', message: 'Failed to send message' });
      setTimeout(() => setNotification(null), 3000);
    }
  };

  const quickEmojis = [
    '💰', '💎', '📈', '📉', '🏦', '💳', '💵', '💸',
    '🔒', '🔑', '🔗', '🤯', '💯', '🚀', '✨', '🧊',
    '🪙', '🟣', '☀️', '🐕', '🕯️', '🔶', '🌱', '🌊',
    '📱', '💻', '📞', '📧', '📡', '⛏️', '🤖', '🕶️'
  ];

  const handleQuickSelect = (emoji) => {
    setNewMessage(prev => prev + emoji);
  };

  const handleSendMoney = async () => {
    if (!nickname) {
      setNotification({ type: 'error', message: 'Set your identity first! 📛' });
      setIsNicknameModalOpen(true);
      return;
    }

    try {
      const messagesRef = collection(db, 'emoji_chat_messages');
      const encryptedContent = xorEncrypt('💰💳💵💎', encryptionKey);
      
      await addDoc(messagesRef, {
        userId,
        userNickname: nickname,
        encryptedContent: encryptedContent,
        timestamp: serverTimestamp()
      });
      setNotification({ type: 'success', message: 'Simulated $100 transfer sent! 💸' });
      setTimeout(() => setNotification(null), 3000);
    } catch (error) {
      console.error('Error sending money:', error);
      setNotification({ type: 'error', message: 'Failed to send transfer' });
      setTimeout(() => setNotification(null), 3000);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <p className="text-xl font-medium text-indigo-500">Connecting to Firestore... 🔗</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen max-h-screen bg-gray-50 font-sans">
      {notification && (
        <div className={`fixed top-4 right-4 z-50 p-4 rounded-lg shadow-xl text-white max-w-sm ${
          notification.type === 'success' ? 'bg-green-500' : 'bg-red-500'
        }`}>
          <div className="flex justify-between items-center">
            <p className="font-bold">{notification.type === 'success' ? 'Success!' : 'Error!'}</p>
            <button
              onClick={() => setNotification(null)}
              className="text-white opacity-70 hover:opacity-100 transition-opacity"
            >
              ×
            </button>
          </div>
          <p className="mt-1 text-sm">{notification.message}</p>
        </div>
      )}

      <header className="p-4 border-b border-gray-200 bg-white shadow-lg z-10 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-extrabold text-indigo-700">
            🧊 Crypto Money Talk 💎
          </h1>
          <p className="text-sm mt-1 text-gray-600">
            <span className="font-semibold text-indigo-500">Identity:</span> {nickname || 'Set your name'}
          </p>
        </div>
        <button
          onClick={() => {
            setModalInput(nickname);
            setIsNicknameModalOpen(true);
          }}
          className="bg-green-500 hover:bg-green-600 text-white font-semibold py-2 px-4 rounded-xl shadow-md transition duration-150 text-sm"
        >
          {nickname ? 'Change Identity' : 'Set Identity'}
        </button>
      </header>

      {!nickname && (
        <div className="p-2 bg-yellow-100 text-yellow-800 text-center font-medium">
          👋 Welcome! Set your name to start the crypto money talk.
        </div>
      )}

      <div className="flex-grow p-4 overflow-y-auto space-y-4 bg-white">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <span className="text-6xl mb-3">🔒</span>
            <p className="text-xl font-medium">Encrypted messages appear here.</p>
            <p className="text-md">Start the secure conversation below.</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMine = msg.userId === userId;
            const decryptedContent = msg.encryptedContent 
              ? xorDecrypt(msg.encryptedContent, encryptionKey)
              : msg.content || '';
            
            return (
              <div
                key={msg.id}
                className={`flex ${isMine ? 'justify-end' : 'justify-start'} mb-3`}
              >
                <div
                  className={`max-w-xs md:max-w-md lg:max-w-lg p-3 rounded-xl shadow-lg ${
                    isMine
                      ? 'bg-indigo-600 text-white rounded-br-none'
                      : 'bg-gray-100 text-gray-800 rounded-tl-none'
                  }`}
                >
                  <div className="text-xs font-semibold mb-1">
                    {isMine ? 'You' : msg.userNickname}
                  </div>
                  <div className="text-3xl sm:text-4xl leading-snug break-words">
                    {decryptedContent}
                  </div>
                  <div className="text-xs text-opacity-75 mt-1 pt-1 border-t border-gray-400 border-opacity-30 italic">
                    {msg.timestamp ? new Date(msg.timestamp.toMillis()).toLocaleTimeString() : 'now'}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      <footer className="p-4 border-t border-gray-200 bg-white shadow-2xl z-10">
        <div className="mb-3 flex flex-wrap gap-2 justify-center sm:justify-start">
          {quickEmojis.map(emoji => (
            <button
              key={emoji}
              onClick={() => handleQuickSelect(emoji)}
              className="text-2xl p-1 rounded-full bg-gray-50 hover:bg-indigo-100 transition-colors duration-150 transform hover:scale-110 shadow-sm"
              title={`Add ${emoji}`}
            >
              {emoji}
            </button>
          ))}
        </div>

        <div className="flex space-x-3">
          <button
            onClick={handleSendMoney}
            className="px-4 py-2 rounded-xl font-bold text-white transition-all duration-200 bg-yellow-500 hover:bg-yellow-600 shadow-xl transform hover:-translate-y-0.5 whitespace-nowrap disabled:opacity-50"
            disabled={!nickname}
          >
            Send $100 💸
          </button>
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
            placeholder="Encrypted money talk only... 🔒"
            className="flex-grow p-3 border-2 border-indigo-400 rounded-xl focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600 text-2xl"
            style={{ height: '56px' }}
          />
          <button
            onClick={sendMessage}
            disabled={!newMessage.trim() || !isOnlyEmojis(newMessage)}
            className={`px-6 py-3 rounded-xl font-bold text-white transition-all duration-200 ${
              !newMessage.trim() || !isOnlyEmojis(newMessage)
                ? 'bg-indigo-300 cursor-not-allowed'
                : 'bg-indigo-600 hover:bg-indigo-700 shadow-xl hover:shadow-2xl transform hover:-translate-y-0.5'
            }`}
          >
            Send
          </button>
        </div>
      </footer>

      {isNicknameModalOpen && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-75 flex items-center justify-center z-40 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6">
            <h2 className="text-xl font-bold text-indigo-700 border-b pb-3 mb-4">Set Your Identity 🏷️</h2>
            <div className="mb-4">
              <label htmlFor="nickname" className="block text-sm font-medium text-gray-700 mb-2">
                Choose a Name (2-15 chars)
              </label>
              <input
                type="text"
                id="nickname"
                value={modalInput}
                onChange={(e) => setModalInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && saveNickname()}
                maxLength={15}
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '2px solid #4f46e5',
                  borderRadius: '8px',
                  fontSize: '18px',
                  fontWeight: 'bold',
                  color: '#000000',
                  backgroundColor: '#ffffff',
                  boxSizing: 'border-box',
                  caretColor: '#4f46e5'
                }}
                placeholder="CryptoWhale"
                autoFocus
              />
              <div style={{ marginTop: '8px', fontSize: '14px', color: '#666' }}>
                Current: {modalInput}
              </div>
              <p className="text-xs text-gray-500 mt-2">This name will be visible to everyone in the chat.</p>
            </div>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setIsNicknameModalOpen(false)}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={saveNickname}
                className="px-4 py-2 rounded-lg font-semibold text-white bg-indigo-600 hover:bg-indigo-700 shadow-md"
              >
                Save Identity
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}