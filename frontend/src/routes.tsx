import { RootRoute, Route } from '@tanstack/react-router';
import { App } from './App';
import { Topics } from './pages/Topics';

const rootRoute = new RootRoute({
  component: () => <App />,
});

const topicsRoute = new Route({
  getParentRoute: () => rootRoute,
  path: '/topics',
  component: Topics,
});

const indexRoute = new Route({
  getParentRoute: () => rootRoute,
  path: '/',
  component: () => <div className="p-4"><h1 className="text-2xl">Welcome to TeachMe</h1></div>,
});

export const routeTree = rootRoute.addChildren([indexRoute, topicsRoute]);
