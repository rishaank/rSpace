import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useApp } from "./lib/store";
import { Loading } from "./components/ui";

import Welcome from "./routes/Welcome";
import Signup from "./routes/Signup";
import Login from "./routes/Login";
import OnboardingYou from "./routes/OnboardingYou";
import OnboardingPlace from "./routes/OnboardingPlace";
import OnboardingAddress from "./routes/OnboardingAddress";
import OnboardingInterests from "./routes/OnboardingInterests";
import OnboardingWeights from "./routes/OnboardingWeights";
import OnboardingDone from "./routes/OnboardingDone";
import MapScreen from "./routes/MapScreen";
import PlaceDetail from "./routes/PlaceDetail";
import Saved from "./routes/Saved";
import Profile from "./routes/Profile";
import ProfileEdit from "./routes/ProfileEdit";
import ProfileWeights from "./routes/ProfileWeights";
import AdoptDetail from "./routes/AdoptDetail";
import AdoptMap from "./routes/AdoptMap";

function RequireAuth({ children }) {
  const { session } = useApp();
  const location = useLocation();
  if (!session) return <Navigate to="/" replace state={{ from: location.pathname }} />;
  return children;
}

// The profiler has to finish before anything can be scored.
function RequireProfile({ children }) {
  const { profile } = useApp();
  if (!profile?.name) return <Navigate to="/onboarding/you" replace />;
  if (profile.lat == null) return <Navigate to="/onboarding/place" replace />;
  return children;
}

export default function App() {
  const { ready } = useApp();

  // The store is restoring the session, profile, weights, favorites, and the
  // catalogue. This used to be a blank frame.
  if (!ready) return <Loading />;

  return (
    <Routes>
      <Route path="/" element={<Welcome />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/login" element={<Login />} />

      <Route
        path="/onboarding/you"
        element={
          <RequireAuth>
            <OnboardingYou />
          </RequireAuth>
        }
      />
      <Route
        path="/onboarding/place"
        element={
          <RequireAuth>
            <OnboardingPlace />
          </RequireAuth>
        }
      />
      <Route
        path="/onboarding/address"
        element={
          <RequireAuth>
            <OnboardingAddress />
          </RequireAuth>
        }
      />
      <Route
        path="/onboarding/interests"
        element={
          <RequireAuth>
            <OnboardingInterests />
          </RequireAuth>
        }
      />
      <Route
        path="/onboarding/weights"
        element={
          <RequireAuth>
            <OnboardingWeights />
          </RequireAuth>
        }
      />
      <Route
        path="/onboarding/done"
        element={
          <RequireAuth>
            <OnboardingDone />
          </RequireAuth>
        }
      />

      {[
        ["/map", <MapScreen />],
        ["/place/:id", <PlaceDetail />],
        ["/saved", <Saved />],
        ["/profile", <Profile />],
        ["/profile/edit", <ProfileEdit />],
        ["/profile/weights", <ProfileWeights />],
        ["/adopt", <AdoptMap />],
        ["/adopt/:id", <AdoptDetail />],
      ].map(([path, element]) => (
        <Route
          key={path}
          path={path}
          element={
            <RequireAuth>
              <RequireProfile>{element}</RequireProfile>
            </RequireAuth>
          }
        />
      ))}

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
