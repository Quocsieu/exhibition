import { Router } from 'express';
import type { ExpoController } from '../controllers/expoController.js';
import { requireAdminAuth } from '../middleware/adminAuth.js';

export function createApiRoutes(controller: ExpoController): Router {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'virtual-expo-25d-be',
      timestamp: new Date().toISOString(),
    });
  });

  // Admin authentication
  router.post('/admin/login', controller.loginAdmin);
  router.get('/admin/me', controller.verifyAdmin);

  // Booths
  router.get('/booths', controller.listBooths);
  router.get('/booths/:id', controller.getBooth);
  router.get('/booths/:id/slots', controller.getBoothSlots);
  router.put('/booths/:id/slots/:slotId', requireAdminAuth, controller.assignBoothSlot);
  router.delete('/booths/:id/slots/:slotId', requireAdminAuth, controller.clearBoothSlot);
  router.post('/booths', requireAdminAuth, controller.createBooth);
  router.put('/booths/:id', requireAdminAuth, controller.updateBooth);
  router.delete('/booths/:id', requireAdminAuth, controller.deleteBooth);

  // Slots
  router.get('/slots', controller.listSlots);

  // Products
  router.get('/products', controller.listProducts);
  router.get('/products/:id', controller.getProduct);
  router.post('/products', requireAdminAuth, controller.createProduct);
  router.put('/products/:id', requireAdminAuth, controller.updateProduct);
  router.delete('/products/:id', requireAdminAuth, controller.deleteProduct);

  // Integrations
  router.post('/integrations/extract-url', requireAdminAuth, controller.extractUrl);
  router.post('/integrations/import-batch', requireAdminAuth, controller.importBatch);

  return router;
}
