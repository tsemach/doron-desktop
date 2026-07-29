//! Deterministic PRNG for corpus generation.
//!
//! Hand-rolled SplitMix64 rather than the `rand` crate: `rand` is only a transitive
//! dependency here, and pinning our own algorithm guarantees a given `--seed` keeps
//! producing the same corpus across dependency upgrades. Reproducibility is a hard
//! requirement — an eval corpus you cannot regenerate cannot be compared across runs.

pub struct Rng {
    state: u64,
}

impl Rng {
    pub fn new(seed: u64) -> Self {
        // Avoid the all-zero state, which SplitMix64 handles but which makes
        // seed=0 look suspiciously structured in the first few draws.
        Self {
            state: seed ^ 0xA076_1D64_78BD_642F,
        }
    }

    pub fn next_u64(&mut self) -> u64 {
        self.state = self.state.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut z = self.state;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        z ^ (z >> 31)
    }

    /// Uniform in `[0, n)`. Returns 0 when `n == 0`.
    pub fn below(&mut self, n: usize) -> usize {
        if n == 0 {
            return 0;
        }
        (self.next_u64() % n as u64) as usize
    }

    /// Uniform in `[lo, hi]` inclusive.
    pub fn range(&mut self, lo: u64, hi: u64) -> u64 {
        if hi <= lo {
            return lo;
        }
        lo + self.next_u64() % (hi - lo + 1)
    }

    pub fn chance(&mut self, p: f64) -> bool {
        (self.next_u64() % 10_000) < (p.clamp(0.0, 1.0) * 10_000.0) as u64
    }

    pub fn choose<'a, T>(&mut self, items: &'a [T]) -> &'a T {
        &items[self.below(items.len())]
    }

    pub fn shuffle<T>(&mut self, items: &mut [T]) {
        if items.len() < 2 {
            return;
        }
        for i in (1..items.len()).rev() {
            let j = self.below(i + 1);
            items.swap(i, j);
        }
    }

    /// `count` distinct picks; returns fewer if the pool is smaller.
    pub fn sample<'a, T>(&mut self, items: &'a [T], count: usize) -> Vec<&'a T> {
        let mut idx: Vec<usize> = (0..items.len()).collect();
        self.shuffle(&mut idx);
        idx.into_iter().take(count).map(|i| &items[i]).collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn same_seed_same_sequence() {
        let a: Vec<u64> = (0..32).map(|_| Rng::new(42).next_u64()).collect();
        let mut r = Rng::new(42);
        let b: Vec<u64> = (0..32).map(|_| r.next_u64()).collect();
        // First draw of a fresh Rng(42) must equal the first draw of a running one.
        assert_eq!(a[0], b[0]);

        let mut r1 = Rng::new(7);
        let mut r2 = Rng::new(7);
        let s1: Vec<u64> = (0..64).map(|_| r1.next_u64()).collect();
        let s2: Vec<u64> = (0..64).map(|_| r2.next_u64()).collect();
        assert_eq!(s1, s2);
    }

    #[test]
    fn different_seeds_diverge() {
        let mut r1 = Rng::new(1);
        let mut r2 = Rng::new(2);
        assert_ne!(r1.next_u64(), r2.next_u64());
    }

    #[test]
    fn below_is_in_range_and_handles_zero() {
        let mut r = Rng::new(9);
        for _ in 0..200 {
            assert!(r.below(5) < 5);
        }
        assert_eq!(r.below(0), 0);
    }

    #[test]
    fn range_is_inclusive_and_handles_degenerate() {
        let mut r = Rng::new(11);
        for _ in 0..200 {
            let v = r.range(10, 12);
            assert!((10..=12).contains(&v));
        }
        assert_eq!(r.range(5, 5), 5);
        assert_eq!(r.range(9, 3), 9);
    }

    #[test]
    fn shuffle_is_a_permutation() {
        let mut r = Rng::new(3);
        let mut v: Vec<u32> = (0..50).collect();
        r.shuffle(&mut v);
        v.sort_unstable();
        assert_eq!(v, (0..50).collect::<Vec<_>>());
    }

    #[test]
    fn sample_returns_distinct_items() {
        let mut r = Rng::new(5);
        let pool: Vec<u32> = (0..10).collect();
        let picked = r.sample(&pool, 4);
        assert_eq!(picked.len(), 4);
        let mut vals: Vec<u32> = picked.into_iter().copied().collect();
        vals.sort_unstable();
        vals.dedup();
        assert_eq!(vals.len(), 4);
        assert_eq!(r.sample(&pool, 99).len(), 10);
    }
}
