import { createRootRoute, createRoute } from '@tanstack/react-router';
import { App } from './App';
import { Hello } from './Hello';
import { Chat } from './Chat';

const rootRoute = createRootRoute({ component: App });

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: Hello,
});

const chatRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/chat',
  component: Chat,
});

export const routeTree = rootRoute.addChildren([indexRoute, chatRoute]);
