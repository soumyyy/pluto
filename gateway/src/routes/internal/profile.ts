/**
 * Internal API routes for profile operations.
 * Provides secure service-to-service profile management.
 */
import { Router, type Response } from 'express';
import { 
  validateInternalAuth, 
  requireInternalUser, 
  getInternalUserId,
  type AuthenticatedRequest 
} from '../../middleware/internalAuth';
import { InternalProfileService } from '../../services/internal/profileService';
import { 
  validateProfileUpdateRequest,
  createSuccessResponse,
  createErrorResponse,
  type ProfileUpdateRequest
} from '../../models/internal';
import { isValidUUID } from '../../services/db';

const router = Router();
const profileService = new InternalProfileService();

/**
 * GET /internal/profile/:userId - Get user profile
 */
router.get('/:userId', [
  validateInternalAuth,
  requireInternalUser
], async (req: AuthenticatedRequest, res) => {
  const requestId = req.internal!.requestId;
  const serviceId = req.internal!.serviceId;
  
  try {
    const userId = getInternalUserId(req);
    
    if (!userId) {
      return res.status(400).json(
        createErrorResponse(
          'User ID is required',
          'USER_ID_REQUIRED',
          requestId
        )
      );
    }

    if (!isValidUUID(userId)) {
      return res.status(400).json(
        createErrorResponse(
          'Invalid user ID format',
          'INVALID_USER_ID',
          requestId
        )
      );
    }

    const profile = await profileService.getProfile(userId);
    
    if (!profile) {
      return res.status(404).json(
        createErrorResponse(
          'Profile not found',
          'PROFILE_NOT_FOUND', 
          requestId
        )
      );
    }

    console.info('[InternalAPI] Profile retrieved', {
      userId,
      serviceId,
      requestId,
      hasProfile: !!profile
    });

    return res.json(createSuccessResponse(profile, requestId));

  } catch (error) {
    console.error('[InternalAPI] Failed to get profile', {
      userId: req.params.userId,
      serviceId,
      requestId,
      error: error instanceof Error ? error.message : String(error)
    });

    return res.status(500).json(
      createErrorResponse(
        'Internal server error',
        'INTERNAL_ERROR',
        requestId
      )
    );
  }
});

/**
 * POST /internal/profile/:userId - Update user profile
 */
router.post('/:userId', [
  validateInternalAuth,
  requireInternalUser
], async (req: AuthenticatedRequest, res) => {
  const requestId = req.internal!.requestId;
  const serviceId = req.internal!.serviceId;

  try {
    const userId = getInternalUserId(req);
    
    if (!userId) {
      return res.status(400).json(
        createErrorResponse(
          'User ID is required',
          'USER_ID_REQUIRED',
          requestId
        )
      );
    }

    if (!isValidUUID(userId)) {
      return res.status(400).json(
        createErrorResponse(
          'Invalid user ID format',
          'INVALID_USER_ID',
          requestId
        )
      );
    }

    // Validate request body
    const updateRequest = req.body as ProfileUpdateRequest;
    if (!validateProfileUpdateRequest(updateRequest)) {
      return res.status(400).json(
        createErrorResponse(
          'Invalid request format',
          'INVALID_REQUEST',
          requestId
        )
      );
    }

    // Process the update
    const result = await profileService.updateProfile(userId, updateRequest);

    if (!result.success) {
      const statusCode = result.code === 'VALIDATION_ERROR' ? 400 : 500;
      return res.status(statusCode).json(
        createErrorResponse(
          result.error || 'Profile update failed',
          result.code || 'UPDATE_FAILED',
          requestId
        )
      );
    }

    console.info('[InternalAPI] Profile updated', {
      userId,
      serviceId,
      requestId,
      changes: result.changes?.length || 0,
      field: updateRequest.field,
      hasNote: !!updateRequest.note
    });

    return res.json(
      createSuccessResponse(
        {
          profile: result.profile,
          changes: result.changes
        },
        requestId
      )
    );

  } catch (error) {
    console.error('[InternalAPI] Failed to update profile', {
      userId: req.params.userId,
      serviceId, 
      requestId,
      error: error instanceof Error ? error.message : String(error),
      body: req.body
    });

    return res.status(500).json(
      createErrorResponse(
        'Internal server error',
        'INTERNAL_ERROR',
        requestId
      )
    );
  }
});

/**
 * GET /internal/profile/:userId/status - Get profile status/health
 */
router.get('/:userId/status', [
  validateInternalAuth
], async (req: AuthenticatedRequest, res) => {
  const requestId = req.internal!.requestId;
  const userId = req.params.userId;

  try {
    if (!isValidUUID(userId)) {
      return res.status(400).json(
        createErrorResponse(
          'Invalid user ID format',
          'INVALID_USER_ID',
          requestId
        )
      );
    }

    const profile = await profileService.getProfile(userId);
    
    const status = {
      userExists: !!profile,
      hasProfile: !!profile,
      profileFields: profile ? Object.keys(profile).filter(key => 
        profile[key as keyof typeof profile] !== null && 
        profile[key as keyof typeof profile] !== undefined
      ).length : 0,
      lastUpdated: profile?.updatedAt || null
    };

    return res.json(createSuccessResponse(status, requestId));

  } catch (error) {
    console.error('[InternalAPI] Failed to get profile status', {
      userId,
      requestId,
      error: error instanceof Error ? error.message : String(error)
    });

    return res.status(500).json(
      createErrorResponse(
        'Internal server error',
        'INTERNAL_ERROR',
        requestId
      )
    );
  }
});

export default router;