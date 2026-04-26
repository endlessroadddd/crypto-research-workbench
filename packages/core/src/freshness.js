import { clamp } from "./utils";
export const computeFreshness = (timestamp, ttlMs, degradingStartRatio, now, degradingFloor = 0.2) => {
    const age = Math.max(0, now.getTime() - new Date(timestamp).getTime());
    const degradingStart = ttlMs * degradingStartRatio;
    if (age <= degradingStart) {
        return { freshnessState: "fresh", freshnessWeight: 1 };
    }
    if (age <= ttlMs) {
        const progress = (age - degradingStart) / Math.max(1, ttlMs - degradingStart);
        return {
            freshnessState: "degrading",
            freshnessWeight: clamp(1 - progress * (1 - degradingFloor), degradingFloor, 1)
        };
    }
    return { freshnessState: "stale", freshnessWeight: 0 };
};
export const applyFreshness = (evidence, now, degradingFloor = 0.2) => evidence.map((item) => {
    const freshness = computeFreshness(item.timestamp, item.ttlMs, item.degradingStartRatio, now, degradingFloor);
    return {
        ...item,
        ...freshness
    };
});
//# sourceMappingURL=freshness.js.map