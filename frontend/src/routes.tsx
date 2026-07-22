import { createRootRoute, createRoute } from '@tanstack/react-router';
import { App } from './App';
import { Chat } from './Chat';
import { LearningHome } from './LearningHome';
import { PlanPage } from './PlanPage';
import { StudyPage } from './StudyPage';

const rootRoute = createRootRoute({ component: App });

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: LearningHome,
});

const chatRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/chat',
  component: Chat,
});

const planRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/plans/$planId',
  component: PlanPage,
});

const nodeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/nodes/$nodeId',
  component: StudyPage,
});

export const routeTree = rootRoute.addChildren([indexRoute, chatRoute, planRoute, nodeRoute]);
