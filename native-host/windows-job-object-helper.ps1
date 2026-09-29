param(
  [Parameter(Mandatory = $true)]
  [int] $TargetPid
)

$source = @'
using System;
using System.Runtime.InteropServices;

public static class DeepSeekPpJobObject {
    private const uint PROCESS_TERMINATE = 0x0001;
    private const uint PROCESS_SET_QUOTA = 0x0100;
    private const uint PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;
    private const uint JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x2000;
    private const int JobObjectExtendedLimitInformation = 9;

    [StructLayout(LayoutKind.Sequential)]
    private struct BasicLimitInformation {
        public long PerProcessUserTimeLimit;
        public long PerJobUserTimeLimit;
        public uint LimitFlags;
        public UIntPtr MinimumWorkingSetSize;
        public UIntPtr MaximumWorkingSetSize;
        public uint ActiveProcessLimit;
        public UIntPtr Affinity;
        public uint PriorityClass;
        public uint SchedulingClass;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct IoCounters {
        public ulong ReadOperationCount;
        public ulong WriteOperationCount;
        public ulong OtherOperationCount;
        public ulong ReadTransferCount;
        public ulong WriteTransferCount;
        public ulong OtherTransferCount;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct ExtendedLimitInformation {
        public BasicLimitInformation BasicLimitInformation;
        public IoCounters IoInfo;
        public UIntPtr ProcessMemoryLimit;
        public UIntPtr JobMemoryLimit;
        public UIntPtr PeakProcessMemoryUsed;
        public UIntPtr PeakJobMemoryUsed;
    }

    [DllImport("kernel32.dll", SetLastError = true)] private static extern IntPtr CreateJobObject(IntPtr attributes, string name);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern bool SetInformationJobObject(IntPtr job, int infoClass, IntPtr info, uint length);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern bool CloseHandle(IntPtr handle);

    public static IntPtr CreateAndAssign(int pid) {
        var process = OpenProcess(PROCESS_TERMINATE | PROCESS_SET_QUOTA | PROCESS_QUERY_LIMITED_INFORMATION, false, pid);
        if (process == IntPtr.Zero) { Console.Error.WriteLine("OpenProcess:" + Marshal.GetLastWin32Error()); return IntPtr.Zero; }
        var job = CreateJobObject(IntPtr.Zero, null);
        if (job == IntPtr.Zero) { var error = Marshal.GetLastWin32Error(); CloseHandle(process); Console.Error.WriteLine("CreateJobObject:" + error); return IntPtr.Zero; }
        var info = new ExtendedLimitInformation();
        info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        var size = Marshal.SizeOf(info);
        var memory = Marshal.AllocHGlobal(size);
        try {
            Marshal.StructureToPtr(info, memory, false);
            if (!SetInformationJobObject(job, JobObjectExtendedLimitInformation, memory, (uint)size)) {
                var error = Marshal.GetLastWin32Error(); CloseHandle(job); Console.Error.WriteLine("SetInformationJobObject:" + error); return IntPtr.Zero;
            }
            if (!AssignProcessToJobObject(job, process)) {
                var error = Marshal.GetLastWin32Error(); CloseHandle(job); Console.Error.WriteLine("AssignProcessToJobObject:" + error); return IntPtr.Zero;
            }
            return job;
        } finally {
            Marshal.FreeHGlobal(memory);
            CloseHandle(process);
        }
    }

    public static void Close(IntPtr handle) {
        if (handle != IntPtr.Zero) CloseHandle(handle);
    }
}
'@

Add-Type -TypeDefinition $source -Language CSharp
$job = [DeepSeekPpJobObject]::CreateAndAssign($TargetPid)
if ($job -eq [IntPtr]::Zero) { exit 2 }
[Console]::Out.WriteLine('READY')
[Console]::Out.Flush()
try {
  while (Get-Process -Id $TargetPid -ErrorAction SilentlyContinue) {
    Start-Sleep -Milliseconds 100
  }
} finally {
  [DeepSeekPpJobObject]::Close($job)
}
