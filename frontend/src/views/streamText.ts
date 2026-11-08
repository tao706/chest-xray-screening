export function createStreamText(append: (text: string) => void, signal: AbortSignal) {
    let pending: string[] = [];
    let frame = 0;
    let previous = 0;
    let credit = 0;
    let ended = false;
    let resolveDrain: (() => void) | undefined;
    function tick(now: number) {
        frame = 0;
        const elapsed = previous ? Math.min(now - previous, 32) : 16;
        previous = now;
        credit += elapsed * Math.min(240, 70 + pending.length * 0.3) / 1000;
        const count = Math.min(8, Math.floor(credit), pending.length);
        if (count) {
            credit -= count;
            append(pending.splice(0, count).join(""));
        }
        if (pending.length)
            frame = requestAnimationFrame(tick);
        else {
            previous = 0;
            credit = 0;
            resolveDrain?.();
            resolveDrain = undefined;
        }
    }
    function cancel() {
        ended = true;
        cancelAnimationFrame(frame);
        frame = 0;
        pending = [];
        resolveDrain?.();
        resolveDrain = undefined;
    }
    signal.addEventListener("abort", cancel, { once: true });
    if (signal.aborted)
        cancel();
    return {
        push(text: string) {
            if (ended || !text)
                return;
            pending.push(...Array.from(text));
            if (!frame)
                frame = requestAnimationFrame(tick);
        },
        drain() {
            return pending.length ? new Promise<void>((resolve) => { resolveDrain = resolve; }) : Promise.resolve();
        },
        dispose() {
            signal.removeEventListener("abort", cancel);
            cancel();
        }
    };
}
