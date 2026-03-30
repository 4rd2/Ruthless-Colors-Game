// ============================================================
// Toast Notification System
// ============================================================

export type ToastType = 'info' | 'warning' | 'error' | 'success';

export interface Toast {
    id: string;
    message: string;
    type: ToastType;
}


export default function ToastManager({ toasts }: { toasts: Toast[] }) {
    if (toasts.length === 0) return null;

    return (
        <div>
            {toasts.map(toast => (
                <div
                    key={toast.id}
                >
                    {toast.message}
                </div>
            ))}
        </div>
    );
}
