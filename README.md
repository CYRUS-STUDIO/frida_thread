> 版权归作者所有，如有转发，请注明文章出处：<https://cyrus-studio.github.io/blog/>



# **Android 线程相关命令**



## **获取 PID**



```
adb shell pidof com.shizhuang.duapp
```


## **查看线程信息**



### **方法一：进入 /proc/<pid>/task**



进入 adb shell 执行下面命令

```
cd /proc/$(pidof com.shizhuang.duapp)/task
ls
```
这个目录中每一个子目录的名字就是该 App 的一个线程的 TID（Thread ID）。



你还可以进一步查看每个线程的状态：

```
cat /proc/$(pidof com.shizhuang.duapp)/task/<tid>/status
```


例如：

```
cat /proc/$(pidof com.shizhuang.duapp)/task/22432/status
```


### **方法二：使用 top 或 htop 查看线程**



使用 top 查看线程信息

```
top -H -p $(pidof com.shizhuang.duapp)
```
- -H 表示以线程方式查看

- -p 指定 PID



![word/media/image1.png](https://gitee.com/cyrus-studio/images/raw/master/fcba0742df92aa7ac76c23b9782248eb.png)


或者使用 htop 查看线程信息

```
htop -p $(pidof com.shizhuang.duapp)
```




![word/media/image2.png](https://gitee.com/cyrus-studio/images/raw/master/38cf170942d92deb8a21006ba4127500.png)


## **通过 kill 命令 停止  / 挂起 / 恢复线程**



kill 是 Linux 系统中用来向进程发送信号的命令，最常用于终止进程。虽然它名字叫 “kill”，但它可以发送多种信号，不只是“终止”。



进入 adb shell，比如线程/进程 id 为 22432

```
# 停止指定进程/线程 
kill 22432

# 强制停止进程/线程
kill -9 22432

# 强制停止 com.cyrus.example
kill -9 $(pidof com.cyrus.example)

# 挂起进程/线程
kill -19 22432

# 继续进程/线程
kill -18 22432
```


kill 命令详细介绍：[https://man7.org/linux/man-pages/man1/kill.1.html](https://man7.org/linux/man-pages/man1/kill.1.html)



常见信号类型（默认是 SIGTERM）：

| 信号名 | 数值 | 含义 |
|--- | --- | ---|
| SIGHUP | 1 | 挂起信号，通常用于重启进程配置 |
| SIGINT | 2 | 中断信号，类似 Ctrl+C |
| SIGQUIT | 3 | 退出信号，类似 Ctrl+\ |
| SIGKILL | 9 | 强制终止信号（无法捕获） |
| SIGTERM | 15 | 终止信号（可捕获、默认） |
| SIGSTOP | 19 | 暂停进程（无法捕获） |
| SIGCONT | 18 | 恢复被暂停的进程 |


# **使用 Frida 调用 kill 命令**



kill 在 C 语言中是定义在 <signal.h> 中的一个标准函数，它本质上是一个系统调用的封装函数。



kill 函数（C 标准库中的定义）

```
#include <signal.h>

int kill(pid_t pid, int sig);
```
- pid：要发送信号的进程 ID。

- sig：要发送的信号编号，比如 SIGKILL, SIGTERM, SIGSTOP 等。

- 返回值：返回 0 表示成功。返回 -1 表示失败，并设置 errno。



在底层，kill() 实际上会触发系统调用（比如 Linux 的 syscall kill），让内核发送信号给指定的进程。



它是 UNIX/Linux 系统里最常用的进程间通信（IPC）手段之一。



## **1. JS + NativeFunction 调用 libc 中的 kill**



查找 libc 中的 kill 函数，并使用 NativeFunction 封装引用

```
const killPtr = Module.findExportByName(null, 'kill');
const kill = new NativeFunction(killPtr, 'int', ['int', 'int']);
```


## **2. 在 JS 中调用这个函数**



挂起线程

```
// 挂起进程
const result = kill(22432, 19);

if (result === 0) {
    console.log("✅ Signal sent!");
} else {
    console.log("❌ Failed to send signal.");
}
```


恢复线程

```
// 恢复线程
const result = kill(22432, 18);

if (result === 0) {
    console.log("✅ Signal sent!");
} else {
    console.log("❌ Failed to send signal.");
}
```


## **3. suspendThread / resumeThread**



封装 suspendThread / resumeThread 函数用于挂起和恢复线程。



kill.js：

```
// 加载 libc 中的 kill 函数
const killPtr = Module.findExportByName(null, 'kill');
const kill = new NativeFunction(killPtr, 'int', ['int', 'int']);

// 信号常量
const SIGSTOP = 19;  // 暂停进程（不可被捕获）
const SIGCONT = 18;  // 继续执行进程

// 封装 suspend/resume 函数
function suspendThread(pid) {
    const result = kill(pid, SIGSTOP);
    if (result === 0) {
        console.log(`✅ 成功挂起 PID=${pid}`);
    } else {
        console.log(`❌ 挂起失败 PID=${pid}`);
    }
}

function resumeThread(pid) {
    const result = kill(pid, SIGCONT);
    if (result === 0) {
        console.log(`✅ 成功恢复 PID=${pid}`);
    } else {
        console.log(`❌ 恢复失败 PID=${pid}`);
    }
}
```


执行脚本：

```
frida -H 127.0.0.1:1234 -F -l kill.js
```


调用示例：

```
 // 挂起线程 
suspendThread(22432);  // 替换为目标线程或进程的 PID

// 恢复线程
resumeThread(22432);
```




![word/media/image3.png](https://gitee.com/cyrus-studio/images/raw/master/cc16bd103b76e7c97bf05419bc8fe2dc.png)


# **suspendOtherThread**



实现一个 suspendOtherThread 函数，挂起除了 excludeList 中指定名字的所有线程。



## **1. 读取线程列表**



遍历 /proc/${pid}/task/ 目录下所有目录的名称得到 线程id

```
const taskDir = `/proc/${pid}/task/`;

var dirList = Java.use('java.io.File').$new(taskDir).listFiles()

for (let i = 0; i < dirList.length; i++) {

    // 线程id
    const tid = parseInt(dirList[i].getName());
  
}
```


## **2. 读取线程名称**



线程名称就在 /proc/${pid}/task/${tid}/comm 文件中，读取 comm 文件内容得到线程名称。

```
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
```


相关文档：

- [https://docs.oracle.com/javase/8/docs/api/java/io/File.html](https://docs.oracle.com/javase/8/docs/api/java/io/File.html)

- [https://frida.re/docs/javascript-api/#file](https://frida.re/docs/javascript-api/#file)



## **3. 挂起线程**



挂起除了 excludeList 中指定名字的所有线程

```
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
```


## **4. 调用示例**



```
// 示例：只保留 excludeList 中指定的线程运行，其它全部挂起
const pid = Process.id;
const excludeList = [
    "main",
    "RenderThread",
    "m.cyrus.example",
    "frida",
];

suspendOtherThread(pid, excludeList);
```


执行脚本

```
frida -H 127.0.0.1:1234 -F -l kill.js
```


效果如下：



![word/media/image4.png](https://gitee.com/cyrus-studio/images/raw/master/799bc1eeed91370cbf8ff43d9b8c0715.png)


# **resumeOtherThread**



恢复线程也是类似。

```
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
```


执行脚本

```
frida -H 127.0.0.1:1234 -F -l kill.js
```


调用示例：

```
// 示例：只保留 excludeList 中指定的线程运行，其它全部挂起
const pid = Process.id;
const excludeList = [
    "main",
    "RenderThread",
    "m.cyrus.example",
    "frida",
];

resumeOtherThread(pid, excludeList);
```


输出如下：

```
🟢 跳过线程 "m.cyrus.example" (TID=31263)
🔄 恢复线程 "Jit thread pool" (TID=31269)
✅ 成功恢复 PID=31269
🔄 恢复线程 "Signal Catcher" (TID=31274)
✅ 成功恢复 PID=31274
🔄 恢复线程 "ADB-JDWP Connec" (TID=31275)
✅ 成功恢复 PID=31275
🔄 恢复线程 "HeapTaskDaemon" (TID=31276)
✅ 成功恢复 PID=31276
🔄 恢复线程 "ReferenceQueueD" (TID=31277)
✅ 成功恢复 PID=31277
🔄 恢复线程 "FinalizerDaemon" (TID=31278)
✅ 成功恢复 PID=31278
🔄 恢复线程 "FinalizerWatchd" (TID=31279)
✅ 成功恢复 PID=31279
🔄 恢复线程 "Binder:31263_1" (TID=31280)
✅ 成功恢复 PID=31280
🔄 恢复线程 "Binder:31263_2" (TID=31281)
✅ 成功恢复 PID=31281
🔄 恢复线程 "Binder:31263_3" (TID=31282)
✅ 成功恢复 PID=31282
🔄 恢复线程 "Profile Saver" (TID=31283)
✅ 成功恢复 PID=31283
🟢 跳过线程 "RenderThread" (TID=31284)
🔄 恢复线程 "Binder:31263_4" (TID=31287)
✅ 成功恢复 PID=31287
🟢 跳过线程 "m.cyrus.example" (TID=31293)
🟢 跳过线程 "gmain" (TID=31294)
🔄 恢复线程 "gdbus" (TID=31296)
✅ 成功恢复 PID=31296
🔄 恢复线程 "Thread-20" (TID=31297)
✅ 成功恢复 PID=31297
🟢 跳过线程 "m.cyrus.example" (TID=31263)
🔄 恢复线程 "Jit thread pool" (TID=31269)
✅ 成功恢复 PID=31269
🔄 恢复线程 "Signal Catcher" (TID=31274)
✅ 成功恢复 PID=31274
🔄 恢复线程 "ADB-JDWP Connec" (TID=31275)
✅ 成功恢复 PID=31275
🔄 恢复线程 "HeapTaskDaemon" (TID=31276)
✅ 成功恢复 PID=31276
🔄 恢复线程 "ReferenceQueueD" (TID=31277)
✅ 成功恢复 PID=31277
🔄 恢复线程 "FinalizerDaemon" (TID=31278)
✅ 成功恢复 PID=31278
🔄 恢复线程 "FinalizerWatchd" (TID=31279)
✅ 成功恢复 PID=31279
🔄 恢复线程 "Binder:31263_1" (TID=31280)
✅ 成功恢复 PID=31280
🔄 恢复线程 "Binder:31263_2" (TID=31281)
✅ 成功恢复 PID=31281
🔄 恢复线程 "Binder:31263_3" (TID=31282)
✅ 成功恢复 PID=31282
🔄 恢复线程 "Profile Saver" (TID=31283)
✅ 成功恢复 PID=31283
🟢 跳过线程 "RenderThread" (TID=31284)
🔄 恢复线程 "Binder:31263_4" (TID=31287)
✅ 成功恢复 PID=31287
🟢 跳过线程 "m.cyrus.example" (TID=31293)
🟢 跳过线程 "gmain" (TID=31294)
🔄 恢复线程 "gdbus" (TID=31296)
✅ 成功恢复 PID=31296
🔄 恢复线程 "Thread-38" (TID=31297)
✅ 成功恢复 PID=31297
```


# **完整源码**



```
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
```


执行脚本

```
frida -H 127.0.0.1:1234 -F -l kill.js
```


开源地址：[https://github.com/CYRUS-STUDIO/frida_thread](https://github.com/CYRUS-STUDIO/frida_thread)






