export type SmartQuietResult = {
  suppress: boolean;
  reason: string | null;
  state?: number;
};

const notificationStates: Record<number, string> = {
  1: "Windows reports you are away",
  2: "Windows or a meeting app reports busy / do not disturb",
  3: "A full-screen app is active",
  4: "Windows presentation mode is active",
  5: "Notifications are accepted",
  6: "Windows quiet time is active",
  7: "A Windows app is suppressing notifications",
};

export async function queryWindowsNotificationState(): Promise<SmartQuietResult> {
  if (process.platform !== "win32") return { suppress: false, reason: null };
  try {
    const { default: koffi } = await import("koffi");
    const shell32 = koffi.load("shell32.dll");
    const query = shell32.func(
      "long __stdcall SHQueryUserNotificationState(_Out_ int32_t* state)",
    );
    const output = [5];
    const result = query(output);
    if (result !== 0) return { suppress: false, reason: null };
    const state = Number(output[0]);
    return {
      suppress: [1, 2, 3, 4, 6, 7].includes(state),
      reason: [1, 2, 3, 4, 6, 7].includes(state) ? notificationStates[state] : null,
      state,
    };
  } catch {
    return { suppress: false, reason: null };
  }
}
