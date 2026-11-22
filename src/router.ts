import { createRouter, createWebHashHistory } from 'vue-router'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/slabs' },
    { path: '/slabs', name: 'slabs', component: () => import('@/views/slab_library_view.vue') },
    { path: '/projects', name: 'projects', component: () => import('@/views/project_list_view.vue') },
    {
      path: '/projects/:id/faces',
      name: 'project-faces',
      component: () => import('@/views/face_editor_view.vue'),
      props: true,
    },
    {
      path: '/layout/:projectId',
      name: 'layout',
      component: () => import('@/views/layout_editor_view.vue'),
      props: true,
    },
    {
      path: '/compare/:projectId',
      name: 'compare',
      component: () => import('@/views/plan_compare_view.vue'),
      props: true,
    },
    {
      path: '/matching/:planId',
      name: 'matching',
      component: () => import('@/views/matching_view.vue'),
      props: true,
    },
    {
      path: '/preview/:planId',
      name: 'preview',
      component: () => import('@/views/preview_view.vue'),
      props: true,
    },
    { path: '/settings', name: 'settings', component: () => import('@/views/settings_view.vue') },
  ],
})
