import { createRootRoute, createRoute } from '@tanstack/react-router';
import { App } from './App';
import { Chat } from './Chat';
import { LearningHome } from './LearningHome';
import { PlanPage } from './PlanPage';
import { StudyPage } from './StudyPage';
import { ExplorationHome } from './ExplorationHome';
import { ExplorationSpacePage } from './ExplorationSpacePage';
import { ExplorationWorkspace } from './ExplorationWorkspace';

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

const explorationHomeRoute = createRoute({ getParentRoute: () => rootRoute, path: '/explore', component: ExplorationHome });
const explorationSpaceRoute = createRoute({ getParentRoute: () => rootRoute, path: '/explore/$spaceId', component: ExplorationSpacePage });
const explorationThreadRoute = createRoute({ getParentRoute: () => rootRoute, path: '/explore/$spaceId/thread/$threadId', component: ExplorationWorkspace });

export const routeTree = rootRoute.addChildren([indexRoute, chatRoute, planRoute, nodeRoute, explorationHomeRoute, explorationSpaceRoute, explorationThreadRoute]);
