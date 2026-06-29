// stateSyncService.js - خدمة تجميع الحالة في الفرونت إند
class StateSyncService {
    constructor() {
        this._isRunning = false;
        this._currentState = {
            devices: [],
            downloads: [],
            timestamp: 0
        };
        this._callbacks = [];
        this._unsubscribe = null;
    }

    /**
     * بدء الاستماع لتحديثات الحالة
     */
    start() {
        if (this._isRunning) return;
        
        if (!linkhub || !linkhub.on) {
            console.error('[StateSyncService] linkhub API not available');
            return;
        }

        this._isRunning = true;
        this._unsubscribe = linkhub.on('state:update', (event, state) => {
            this._handleStateUpdate(state);
        });
    }

    /**
     * إيقاف الاستماع
     */
    stop() {
        if (!this._isRunning) return;
        
        this._isRunning = false;
        if (this._unsubscribe) {
            this._unsubscribe();
            this._unsubscribe = null;
        }
    }

    /**
     * الحصول على الحالة الحالية
     */
    getState() {
        return { ...this._currentState };
    }

    /**
     * تسجيل callback عند تحديث الحالة
     */
    onUpdate(callback) {
        if (typeof callback !== 'function') {
            throw new Error('Callback must be a function');
        }
        this._callbacks.push(callback);
        
        // إرجاع دالة لإلغاء التسجيل
        return () => {
            const index = this._callbacks.indexOf(callback);
            if (index > -1) {
                this._callbacks.splice(index, 1);
            }
        };
    }

    /**
     * معالجة تحديث الحالة من الباك إند
     */
    _handleStateUpdate(state) {
        if (!state) return;

        this._currentState = {
            devices: state.devices || [],
            downloads: state.downloads || [],
            timestamp: state.timestamp || Date.now()
        };

        // إخطار جميع المستمعين
        this._callbacks.forEach(callback => {
            try {
                callback(this._currentState);
            } catch (err) {
                console.error('[StateSyncService] Error in callback:', err);
            }
        });
    }
}

// إنشاء instance واحد
const stateSyncService = new StateSyncService();

export default stateSyncService;
