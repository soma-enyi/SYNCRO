import { Router, Response, Request } from 'express';
import { merchantService } from '../services/merchant-service';
import logger from '../config/logger';
import { adminAuth } from '../middleware/admin';
import { renewalRateLimiter } from '../middleware/rate-limiter'; // Added Import

const router = Router();

/**
 * @openapi
 * /api/merchants:
 *   get:
 *     tags: [Merchants]
 *     summary: List merchants
 *     parameters:
 *       - in: query
 *         name: category
 *         schema: { type: string }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *       - in: query
 *         name: offset
 *         schema: { type: integer, default: 0 }
 *     responses:
 *       200:
 *         description: List of merchants
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/Merchant' }
 *                 pagination: { $ref: '#/components/schemas/Pagination' }
 */
router.get('/', async (req: Request, res: Response) => {
    try {
        const { limit, offset, category } = req.query;

        const result = await merchantService.listMerchants({
            category: category as string | undefined,
            limit: limit ? parseInt(limit as string) : undefined,
            offset: offset ? parseInt(offset as string) : undefined,
        });

        res.json({
            success: true,
            data: result.merchants,
            pagination: {
                total: result.total,
                limit: limit ? parseInt(limit as string) : undefined,
                offset: offset ? parseInt(offset as string) : undefined,
            },
        });
    } catch (error) {
        logger.error('List merchants error:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to list merchants',
        });
    }
});

/**
 * @openapi
 * /api/merchants/{id}:
 *   get:
 *     tags: [Merchants]
 *     summary: Get a merchant by ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Merchant object
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { $ref: '#/components/schemas/Merchant' }
 *       404:
 *         description: Not found
 */
router.get('/:id', async (req: Request, res: Response) => {
    try {
        const merchant = await merchantService.getMerchant(req.params.id as string);

        res.json({
            success: true,
            data: merchant,
        });
    } catch (error) {
        logger.error('Get merchant error:', error);
        const statusCode = error instanceof Error && error.message.includes('not found') ? 404 : 500;
        res.status(statusCode).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to get merchant',
        });
    }
});

/**
 * @openapi
 * /api/merchants:
 *   post:
 *     tags: [Merchants]
 *     summary: Create a merchant (admin only)
 *     security:
 *       - adminKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string }
 *               category: { type: string }
 *               website_url: { type: string, format: uri }
 *               logo_url: { type: string, format: uri }
 *     responses:
 *       201:
 *         description: Merchant created
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
router.post('/', adminAuth, async (req: Request, res: Response) => {
    try {
        const { name } = req.body;
        if (!name) {
            return res.status(400).json({
                success: false,
                error: 'Missing required field: name',
            });
        }

        const merchant = await merchantService.createMerchant(req.body);

        res.status(201).json({
            success: true,
            data: merchant,
        });
    } catch (error) {
        logger.error('Create merchant error:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to create merchant',
        });
    }
});

/**
 * @openapi
 * /api/merchants/{id}:
 *   patch:
 *     tags: [Merchants]
 *     summary: Update a merchant (admin only)
 *     security:
 *       - adminKey: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               category: { type: string }
 *               website_url: { type: string, format: uri }
 *               logo_url: { type: string, format: uri }
 *     responses:
 *       200:
 *         description: Updated merchant
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Not found
 *   delete:
 *     tags: [Merchants]
 *     summary: Delete a merchant (admin only)
 *     security:
 *       - adminKey: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Deleted
 *       401:
 *         description: Unauthorized
 */
router.patch('/:id', adminAuth, renewalRateLimiter, async (req: Request, res: Response) => {
    try {
        const merchant = await merchantService.updateMerchant(req.params.id as string, req.body);

        res.json({
            success: true,
            data: merchant,
        });
    } catch (error) {
        logger.error('Update merchant error:', error);
        const statusCode = error instanceof Error && error.message.includes('not found') ? 404 : 500;
        res.status(statusCode).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to update merchant',
        });
    }
});

/**
 * DELETE /api/merchants/:id — covered by PATCH doc block above
 */
router.delete('/:id', adminAuth, async (req: Request, res: Response) => {
    try {
        await merchantService.deleteMerchant(req.params.id as string);

        res.json({
            success: true,
            message: 'Merchant deleted',
        });
    } catch (error) {
        logger.error('Delete merchant error:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to delete merchant',
        });
    }
});

export default router;