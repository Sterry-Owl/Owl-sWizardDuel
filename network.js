/**
 * 網路通訊管理模組 (WebRTC / PeerJS 封裝)
 */
export const NetworkManager = {
    peer: null,
    connection: null,
    isHost: false,
    roomId: null,

    onDataReceived: null,
    onConnected: null,
    onDisconnected: null,

    init() {
        return new Promise((resolve, reject) => {
            if (typeof window.Peer === 'undefined') {
                reject(new Error('PeerJS 程式庫未載入'));
                return;
            }

            const randomCode = Math.random().toString(36).substring(2, 6).toUpperCase();
            this.peer = new window.Peer(`WZD-${randomCode}`, { debug: 1 });

            this.peer.on('open', (id) => {
                this.roomId = id;
                resolve(id);
            });

            this.peer.on('connection', (conn) => {
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

    joinRoom(targetRoomId) {
        if (!this.peer) return;
        this.isHost = false;
        // 採用無序非阻塞通道以達到極致低延遲
        const conn = this.peer.connect(targetRoomId, {
            reliable: false,
            serialization: 'json'
        });
        this.setupConnection(conn);
    },

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

    send(payload) {
        if (this.connection && this.connection.open) {
            this.connection.send(payload);
        }
    }
};
