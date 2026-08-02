// test_file_transfer.js
// اختبار نقل ملف نصي صغير بين الحاسوب والهاتف

const fs = require('fs').promises;
const path = require('path');
const os = require('os');

// محاكاة المكونات المطلوبة
class MockLogger {
    info(msg) { console.log('[INFO]', msg); }
    warn(msg) { console.warn('[WARN]', msg); }
    error(msg) { console.error('[ERROR]', msg); }
}

class MockProcessManager {
    async executeQuickTaskArray(binPath, args, options = {}) {
        const { spawn } = require('child_process');
        return new Promise((resolve, reject) => {
            let child;
            try {
                child = spawn(binPath, Array.isArray(args) ? args : []);
            } catch (error) {
                reject(error);
                return;
            }

            let stdout = '';
            let stderr = '';

            const timeout = setTimeout(() => {
                try {
                    child.kill('SIGTERM');
                } catch { }
                reject(new Error(`Command timeout after ${options.timeout || 30000}ms`));
            }, options.timeout || 30000);

            child.stdout?.on('data', chunk => { stdout += chunk.toString(); });
            child.stderr?.on('data', chunk => { stderr += chunk.toString(); });

            child.once('error', error => {
                clearTimeout(timeout);
                reject(error);
            });

            child.once('exit', code => {
                clearTimeout(timeout);
                if (code === 0 || stdout) {
                    resolve(stdout.trim());
                } else {
                    reject(new Error(`Process exited with code ${code}: ${stderr}`));
                }
            });
        });
    }
}

class MockProcessSupervisor {
    constructor() {
        this._processManager = new MockProcessManager();
    }

    async executeQuickTaskArray(binPath, args = [], options = {}) {
        return this._processManager.executeQuickTaskArray(binPath, args, options);
    }
}

// استيراد AdbCommandExecutor بعد التعديل
const AdbCommandExecutor = require('./src/main/infrastructure/adb/AdbCommandExecutor');
const AdbPushService = require('./src/main/infrastructure/adb/AdbPushService');

async function main() {
    console.log('=== اختبار نقل الملف بين الحاسوب والهاتف ===\n');

    // 1. إنشاء ملف نصي صغير للاختبار
    const testFileName = 'test_transfer_file.txt';
    const testDir = path.join(os.tmpdir(), 'linkhub_test');
    const testFilePath = path.join(testDir, testFileName);
    const testContent = 'هذا ملف اختبار للنقل بين الحاسوب والهاتف\nTest file transfer\n' + Date.now();

    try {
        // إنشاء المجلد المؤقت
        await fs.mkdir(testDir, { recursive: true });
        console.log(`✓ تم إنشاء المجلد المؤقت: ${testDir}`);

        // إنشاء الملف
        await fs.writeFile(testFilePath, testContent, 'utf8');
        console.log(`✓ تم إنشاء ملف الاختبار: ${testFilePath}`);
        console.log(`  الحجم: ${testContent.length} بايت\n`);

        // 2. إعداد المكونات
        const logger = new MockLogger();
        const processSupervisor = new MockProcessSupervisor();
        
        // تحديد مسار ADB
        const adbPath = process.platform === 'win32' 
            ? path.join(process.cwd(), 'resources', 'bin', 'win', 'adb.exe')
            : path.join(process.cwd(), 'resources', 'bin', 'linux', 'adb');

        console.log(`مسار ADB: ${adbPath}\n`);

        const adbExecutor = new AdbCommandExecutor({
            processSupervisor,
            logger,
            adbPath
        });

        const adbPushService = new AdbPushService({
            adbExecutor,
            logger
        });

        // 3. التحقق من الأجهزة المتصلة
        console.log('--- التحقق من الأجهزة المتصلة ---');
        const devices = await adbExecutor.getDevices();
        console.log(`الأجهزة المتصلة: ${devices.length}`);
        
        if (devices.length === 0) {
            console.log('⚠ لا توجد أجهزة متصلة. يرجى توصيل جهاز وتفعيل USB debugging.');
            return;
        }

        const device = devices[0];
        console.log(`✓ الجهاز: ${device.serial} (${device.state})\n`);

        // 4. التحقق من اتصال الجهاز
        console.log('--- التحقق من اتصال الجهاز ---');
        const isConnected = await adbExecutor.isDeviceConnected(device.serial);
        console.log(`الاتصال: ${isConnected ? 'متصل ✓' : 'غير متصل ✗'}`);

        if (!isConnected) {
            console.log('⚠ الجهاز غير متصل.');
            return;
        }

        // 5. اختبار أمر shell بسيط (للتحقق من إصلاح الخطأ)
        console.log('\n--- اختبار أمر shell (stat) ---');
        try {
            const testCommand = ['echo', 'test'];
            const shellOutput = await adbExecutor._executeShellCommand(device.serial, testCommand);
            console.log(`✓ أمر shell نجح: "${shellOutput}"`);
        } catch (error) {
            console.error(`✗ أمر shell فشل: ${error.message}`);
        }

        // 6. نقل الملف
        console.log('\n--- بدء نقل الملف ---');
        const remotePath = `/sdcard/Download/${testFileName}`;
        
        const transferResult = await adbPushService.pushFile(
            testFilePath,
            device.serial,
            remotePath,
            false // لا تحذف الملف بعد النقل
        );

        console.log(`نتيجة النقل: ${transferResult.success ? 'نجح ✓' : 'فشل ✗'}`);
        console.log(`الرسالة: ${transferResult.message}`);
        console.log(`التقدم: ${(transferResult.progress * 100).toFixed(1)}%`);

        // 7. التحقق من الملف على الجهاز
        console.log('\n--- التحقق من الملف على الجهاز ---');
        try {
            const sizeCommand = ['stat', '-c', '%s', `"${remotePath}"`];
            const sizeOutput = await adbExecutor._executeShellCommand(device.serial, sizeCommand);
            const remoteSize = parseInt(sizeOutput.trim());
            
            if (!isNaN(remoteSize) && remoteSize > 0) {
                console.log(`✓ الملف موجود على الجهاز`);
                console.log(`  الحجم على الجهاز: ${remoteSize} بايت`);
                console.log(`  الحجم الأصلي: ${testContent.length} بايت`);
                
                if (remoteSize === testContent.length) {
                    console.log('✓ الأحجام متطابقة - النقل صحيح!');
                } else {
                    console.log('⚠ الأحجام غير متطابقة');
                }
            } else {
                console.log('✗ لم يتم العثور على الملف على الجهاز');
            }
        } catch (error) {
            console.error(`✗ فشل التحقق: ${error.message}`);
        }

        // 8. تنظيف
        console.log('\n--- تنظيف ---');
        await fs.unlink(testFilePath);
        console.log(`✓ تم حذف الملف المؤقت: ${testFilePath}`);

    } catch (error) {
        console.error('\n✗ خطأ عام:', error.message);
        console.error(error.stack);
    } finally {
        // تنظيف المجلد المؤقت
        try {
            await fs.rmdir(testDir);
            console.log(`✓ تم حذف المجلد المؤقت: ${testDir}`);
        } catch { }
    }

    console.log('\n=== انتهى الاختبار ===');
}

// تشغيل الاختبار
main().catch(console.error);
