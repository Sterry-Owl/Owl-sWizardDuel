/**
 * 網路通訊管理模組 (WebRTC / PeerJS 封裝)
 */
export const NetworkManager = {
    peer: null,
    connection: null,
    isHost: false,
    roomId: null,

    // 回呼函式掛載
    onDataReceived: null,
    onConnected: null,
    onDisconnected: null,

    /**
     * 初始化 Peer 節點
     * @returns {Promise<string>} 回傳分配到的 Peer ID
     */
    init() {
        return new Promise((resolve, reject) => {
            if (typeof window.Peer === 'undefined') {
                reject(new Error('PeerJS 程式庫未載入'));
                return;
            }

            // 產生隨機房間後綴代碼 (4碼英數)
            const randomCode = Math.random().toString(36).substring(2, 6).toUpperCase();
            this.peer = new window.Peer(`WZD-${randomCode}`, { debug: 1 });

            this.peer.on('open', (id) => {
                this.roomId = id;
                resolve(id);
            });

            this.peer.on('connection', (conn) => {
                // 僅允許單一對手連線 (1v1)
                if (this.connection) {
                    conn.close();
                    return;
                }
                this.isHost = true;
                this.setupConnection(conn);
            });

            this.peer.on('error', (err) => {
                console.error('[Network Error]:', err);
            });
        });
    },

    /**
     * 加入指定房間
     * @param {string} targetRoomId 目標房間 ID
     */
    joinRoom(targetRoomId) {
        if (!this.peer) return;
        this.isHost = false;
        const conn = this.peer.connect(targetRoomId, { reliable: true });
        this.setupConnection(conn);
    },

    /**
     * 設定資料通道監聽
     */
    setupConnection(conn) {
        this.connection = conn;

        this.connection.on('open', () => {
            if (typeof this.onConnected === 'function') {
                this.onConnected(this.isHost);
            }
        });

        this.connection.on('data', (data) => {
            if (typeof this.onDataReceived === 'function') {
                this.onDataReceived(data);
            }
        });

        this.connection.on('close', () => {
            this.connection = null;
            if (typeof this.onDisconnected === 'function') {
                this.onDisconnected();
            }
        });
    },

    /**
     * 傳送封包
     * @param {object} payload 欲傳送的資料物件
     */
    send(payload) {
        if (this.connection && this.connection.open) {
            this.connection.send(payload);
        }
    }
};
