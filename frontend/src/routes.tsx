import { createRootRoute, createRoute } from '@tanstack/react-router';
import { App } from './App';
import { Hello } from './Hello';

const rootRoute = createRootRoute({ component: App });

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: Hello,
});

export const routeTree = rootRoute.addChildren([indexRoute]);
