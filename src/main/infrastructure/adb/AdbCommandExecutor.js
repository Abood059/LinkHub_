// src/main/infrastructure/adb/AdbCommandExecutor.js
'use strict';

const path = require('path');
const { randomUUID } = require('crypto');

class AdbCommandExecutor {
    constructor({
        processSupervisor,
        logger = null,
        adbPath = null,
        toolPathResolver = null   // <-- جديد: محلل المسار الموحد
    }) {
        this._processSupervisor = processSupervisor;
        this._logger = logger;
        this._toolPathResolver = toolPathResolver;

        // تحديد مسار ADB (الأولوية: adbPath المُمرر > toolPathResolver > المسار القديم)
        if (adbPath) {
            this._adbPath = adbPath;
        } else if (this._toolPathResolver) {
            this._adbPath = this._toolPathResolver.getAdbPath();
        } else {
            // احتياطي: الطريقة القديمة (للتوافق مع الكود القديم)
            this._adbPath = this._resolveAdbPathLegacy();
        }
    }

    /**
     * Validate and sanitize serial/target input to prevent command injection
     * @param {string} input - The serial or target to validate
     * @returns {string} The validated input
     * @throws {Error} If input contains dangerous characters
     */
    _sanitizeSerialOrTarget(input) {
        if (!input || typeof input !== 'string') {
            throw new Error('Serial or target must be a non-empty string');
        }

        // Allow alphanumeric, hyphens, underscores, dots, colons, and spaces
        // Reject characters commonly used in command injection: ;, &, |, `, $, (, ), <, >
        const dangerousPattern = /[;&|`$()<>]/;
        if (dangerousPattern.test(input)) {
            throw new Error(`Invalid serial or target: contains dangerous characters`);
        }

        // Trim whitespace
        return input.trim();
    }

    async getDevices() {
        try {
            // الاستدعاء الصحيح المتوافق مع الكود الخاص بك لتنفيذ الأوامر السريعة لـ ADB
            const output = await this._executeQuickAdbCommand(['devices']);
            
            // التحقق من أن المخرجات نصية وليست فارغة
            if (!output || typeof output !== 'string') {
                return [];
            }
    
            // تقطيع النص إلى أسطر بشكل مرن يتعامل مع (\n) و (\r\n) بالتساوي بين الأنظمة
            const lines = output.split(/\r?\n/);
    
            // التحقق الإضافي للتأكد من وجود أسطر صالحة للمعالجة
            if (!Array.isArray(lines) || lines.length <= 1) {
                return [];
            }
    
            // تصفية الأسطر وتحليلها بأمان كامل
            return lines
                .slice(1) // تخطي السطر الأول العناوين "List of devices attached"
                .filter(line => line.trim() !== '') // تجاهل الأسطر الفارغة
                .map(line => {
                    const [id, state] = line.split(/\s+/); // التقسيم بناءً على الفراغات بين المعرف والحالة
                    return { serial: id, state: state || 'unknown' }; // إرجاع التركيبة التي يتوقعها نظامك (serial و state)
                })
                .filter(device => device.serial && device.state); // التأكد من نجاح التحليل لكل جهاز
    
        } catch (error) {
            // حماية دورتك الزمنية (كل 5 ثوانٍ) من الانهيار وطباعة خطأ نظيف دون إسقاط Electron
            if (this._logger && typeof this._logger.warn === 'function') {
                this._logger.warn(`[ADB] Failed to get devices list: ${error.message || error}`);
            } else {
                console.warn('[ADB] Failed to get devices list:', error.message || error);
            }
            return [];
        }
    }
    
    async getDeviceInfo(
        serial
    ) {
        const sanitizedSerial = this._sanitizeSerialOrTarget(serial);

        const [
            model,
            version,
            arch
        ] = await Promise.all([
            this._executeShellCommand(
                sanitizedSerial,
                [
                    'getprop',
                    'ro.product.model'
                ]
            ),
            this._executeShellCommand(
                sanitizedSerial,
                [
                    'getprop',
                    'ro.build.version.release'
                ]
            ),
            this._executeShellCommand(
                sanitizedSerial,
                [
                    'getprop',
                    'ro.product.cpu.abi'
                ]
            )
        ]);

        return {
            serial: sanitizedSerial,
            model:
                model.trim(),
            version:
                version.trim(),
            arch:
                arch.trim()
        };
    }

    async connect(
        target
    ) {
        const sanitizedTarget = this._sanitizeSerialOrTarget(target);
        return this._executeQuickAdbCommand([
            'connect',
            sanitizedTarget
        ]);
    }

    async pair(
        host,
        pairingCode
    ) {
        const sanitizedHost = this._sanitizeSerialOrTarget(host);
        // Pairing code should only contain digits
        if (!pairingCode || !/^\d+$/.test(pairingCode)) {
            throw new Error('Pairing code must contain only digits');
        }
        return this._executeQuickAdbCommand([
            'pair',
            sanitizedHost,
            pairingCode
        ]);
    }

    async disconnect(
        target = null
    ) {
        const args =
            target
                ? [
                      'disconnect',
                      this._sanitizeSerialOrTarget(target)
                  ]
                : [
                      'disconnect'
                  ];

        return this._executeQuickAdbCommand(
            args
        );
    }

    async _executeShellCommand(
        serial,
        shellArgs
    ) {
        const sanitizedSerial = this._sanitizeSerialOrTarget(serial);
        const result =
            await this._executeQuickAdbCommand(
                [
                    '-s',
                    sanitizedSerial,
                    'shell',
                    ...shellArgs
                ]
            );

        return result.join('\n');
    }

    async _executeQuickAdbCommand(
        args = []
    ) {
        return this._processSupervisor
            .executeQuickTaskArray(
                this._adbPath,
                args
            );
    }

    // الطريقة القديمة محفوظة كخيار احتياطي (تم تعديل اسمها قليلاً)
    _resolveAdbPathLegacy() {
        const isWin =
            process.platform ===
            'win32';

        return path.join(
            process.cwd(),
            'resources',
            'bin',
            isWin
                ? 'win/adb.exe'
                : 'linux/adb'
        );
    }
}

module.exports =
    AdbCommandExecutor;