// 加载 libc 中的 kill 函数
const killPtr = Module.findExportByName(null, 'kill');
const kill = new NativeFunction(killPtr, 'int', ['int', 'int']);

// 信号常量
const SIGSTOP = 19;  // 暂停进程（不可被捕获）
const SIGCONT = 18;  // 继续执行进程

/**
 * 挂起线程
 *
 * @param pid 线程 id
 */
function suspendThread(pid) {
    const result = kill(pid, SIGSTOP);
    if (result === 0) {
        console.log(`✅ 成功挂起 PID=${pid}`);
    } else {
        console.log(`❌ 挂起失败 PID=${pid}`);
    }
}

/**
 * 恢复线程
 *
 * @param pid 线程 id
 */
function resumeThread(pid) {
    const result = kill(pid, SIGCONT);
    if (result === 0) {
        console.log(`✅ 成功恢复 PID=${pid}`);
    } else {
        console.log(`❌ 恢复失败 PID=${pid}`);
    }
}

/**
 * 读取文件内容并返回字符串
 *
 * @param path 文件路径
 * @returns {string|null} 文件内容
 */
function readFileAsString(path) {
    const File = Java.use("java.io.File");
    const FileInputStream = Java.use("java.io.FileInputStream");
    const InputStreamReader = Java.use("java.io.InputStreamReader");
    const BufferedReader = Java.use("java.io.BufferedReader");
    const StringBuilder = Java.use("java.lang.StringBuilder");

    const file = File.$new(path);
    if (!file.exists()) {
        console.log(`❌ 文件不存在: ${path}`);
        return null;
    }

    const fis = FileInputStream.$new(file);
    const isr = InputStreamReader.$new(fis, "UTF-8");
    const reader = BufferedReader.$new(isr);
    const sb = StringBuilder.$new();

    let line;
    while ((line = reader.readLine()) !== null) {
        sb.append(line);
    }

    reader.close();
    return sb.toString();
}

/**
 * comm 文件内容就是线程名称
 *
 * @param pid   进程 id
 * @param tid   线程 id
 * @returns {string} 线程名称
 */
function readComm(pid, tid) {
    const path = `/proc/${pid}/task/${tid}/comm`;
    return readFileAsString(path);
}

/**
 * 挂起除了 excludeList 中指定名字的所有线程
 * @param {number} pid - 当前进程 PID
 * @param {string[]} excludeList - 不需要挂起的线程名字数组
 */
function suspendOtherThread(pid, excludeList) {
    Java.perform(function () {
        const taskDir = `/proc/${pid}/task/`;

        var dirList = Java.use('java.io.File').$new(taskDir).listFiles()

        for (let i = 0; i < dirList.length; i++) {

            const tid = parseInt(dirList[i].getName());
            if (isNaN(tid)) continue;

            const threadName = readComm(pid, tid);
            if (!threadName) continue;

            // 只要 threadName 包含 excludeList 中的任意关键字，就会被排除（跳过不挂起）
            if (excludeList.some(keyword => threadName.includes(keyword))) {
                console.log(`🟢 跳过线程 "${threadName}" (TID=${tid})`);
            } else {
                console.log(`🛑 挂起线程 "${threadName}" (TID=${tid})`);
                suspendThread(tid);
            }
        }
    })
}

/**
 * 恢复除了 excludeList 中指定名字的所有线程
 * @param {number} pid - 当前进程 PID
 * @param {string[]} excludeList - 不需要恢复的线程名字数组
 */
function resumeOtherThread(pid, excludeList) {
    Java.perform(function () {
        const taskDir = `/proc/${pid}/task/`;

        var dirList = Java.use('java.io.File').$new(taskDir).listFiles()

        for (let i = 0; i < dirList.length; i++) {

            const tid = parseInt(dirList[i].getName());
            if (isNaN(tid)) continue;

            const threadName = readComm(pid, tid);
            if (!threadName) continue;

            // 只要 threadName 包含 excludeList 中的任意关键字，就会被排除（跳过不恢复）
            if (excludeList.some(keyword => threadName.includes(keyword))) {
                console.log(`🟢 跳过线程 "${threadName}" (TID=${tid})`);
            } else {
                console.log(`🔄 恢复线程 "${threadName}" (TID=${tid})`);
                resumeThread(tid);
            }
        }
    })
}

// 示例：只保留 excludeList 中指定的线程运行，其它全部挂起
const pid = Process.id;
const excludeList = [
    "main",
    "RenderThread",
    "m.cyrus.example",
    "frida",
];

// suspendOtherThread(pid, excludeList);
resumeOtherThread(pid, excludeList);


// frida -H 127.0.0.1:1234 -F -l kill.js