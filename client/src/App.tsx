import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import Dashboard from "@/pages/Dashboard";
import CreatorRoster from "@/pages/CreatorRoster";
import PostTracker from "@/pages/PostTracker";
import PayoutQueue from "@/pages/PayoutQueue";
import ScriptLibrary from "@/pages/ScriptLibrary";
import Settings from "@/pages/Settings";
import MessageBuilder from "@/pages/MessageBuilder";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";

function Router() {
  return (
    <Switch>
      <Route path={"/"} component={Dashboard} />
      <Route path={"/creators"} component={CreatorRoster} />
      <Route path={"/posts"} component={PostTracker} />
      <Route path={"/payouts"} component={PayoutQueue} />
      <Route path={"/scripts"} component={ScriptLibrary} />
      <Route path={"/messages"} component={MessageBuilder} />
      <Route path={"/settings"} component={Settings} />
      <Route path={"/404"} component={NotFound} />
      {/* Final fallback route */}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
