import { createContext, useContext, useEffect, useMemo, useState } from "react";
import * as db from "./data";
import { DEFAULT_WEIGHTS, scoreAll } from "./scoring";

const AppContext = createContext(null);

export function useApp() {
  return useContext(AppContext);
}

export function AppProvider({ children }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [weights, setWeights] = useState(DEFAULT_WEIGHTS);
  const [favorites, setFavorites] = useState([]);
  const [allPlaces, setAllPlaces] = useState([]);
  const [scoring, setScoring] = useState(false);
  const [googleDown, setGoogleDown] = useState(false);

  // Boot: restore the session, then everything hanging off it.
  useEffect(() => {
    let live = true;

    (async () => {
      const current = await db.getSession();
      const list = await db.listPlaces();
      if (!live) return;
      setSession(current);
      setAllPlaces(list);
      if (current) await hydrate(current.userId);
      setReady(true);
    })();

    const unsubscribe = db.onAuthChange((next) => {
      setSession(next);
      if (next) hydrate(next.userId);
      else reset();
    });

    return () => {
      live = false;
      unsubscribe();
    };
  }, []);

  // The catalogue is readable only to signed-in users, so it is re-fetched
  // here rather than only at boot.
  async function hydrate(userId) {
    const [nextProfile, nextWeights, nextFavorites, nextPlaces] = await Promise.all([
      db.getProfile(userId),
      db.getWeights(userId),
      db.listFavorites(userId),
      db.listPlaces(),
    ]);
    setProfile(nextProfile);
    setWeights(nextWeights);
    setFavorites(nextFavorites);
    setAllPlaces(nextPlaces);
  }

  function reset() {
    setProfile(null);
    setWeights(DEFAULT_WEIGHTS);
    setFavorites([]);
  }

  // Stable identity: the map effect keys off this, and a fresh object every
  // render would tear the map down and rebuild it on every state change.
  const origin = useMemo(
    () => (profile?.lat != null ? { lat: profile.lat, lng: profile.lng } : null),
    [profile?.lat, profile?.lng]
  );

  // Closed listings stay reachable by link but never rank.
  const places = useMemo(() => allPlaces.filter((p) => !p.closed), [allPlaces]);

  const ranked = useMemo(() => scoreAll(places, weights, origin), [places, weights, origin]);


  const value = {
    ready,
    session,
    profile,
    weights,
    favorites,
    places,
    allPlaces,
    ranked,
    origin,
    scoring,
    googleDown,
    setGoogleDown,

    async signUp(email, password) {
      const result = await db.signUp(email, password);
      if (result.session) {
        setSession(result.session);
        await hydrate(result.session.userId);
      }
      return result;
    },

    async signIn(email, password) {
      const result = await db.signIn(email, password);
      if (result.session) {
        setSession(result.session);
        await hydrate(result.session.userId);
      }
      return result;
    },

    async signOut() {
      await db.signOut();
      setSession(null);
      reset();
    },

    async deleteAccount() {
      await db.deleteAccount(session.userId);
      setSession(null);
      reset();
    },

    async saveProfile(patch) {
      const { profile: next } = await db.saveProfile(session.userId, patch);
      setProfile(next);
      return next;
    },

    // The ranking itself is recomputed synchronously from `next` — what the
    // screen waits on is the write, not the maths. `scoring` used to be a
    // 650ms timer dressed up as a live Google pull; it now tracks the one
    // thing here that is genuinely in flight.
    async saveWeights(next) {
      setWeights(next);
      setScoring(true);
      try {
        await db.saveWeights(session.userId, next);
      } finally {
        setScoring(false);
      }
    },

    async toggleFavorite(slug) {
      const saved = !favorites.includes(slug);
      setFavorites((prev) => (saved ? [...prev, slug] : prev.filter((s) => s !== slug)));
      await db.toggleFavorite(session.userId, slug, saved);
    },
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
