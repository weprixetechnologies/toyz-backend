const affiliateService = require('./affiliateService');
const db = require('../../config/db');

class AffiliateController {
  /**
   * POST /affiliate/register
   */
  async register(req, res, next) {
    try {
      const userId = req.user.id;
      const profile = await affiliateService.registerAffiliate(userId, req.body);
      res.status(201).json({
        success: true,
        data: profile,
        message: 'Successfully registered as an affiliate.'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /affiliate/dashboard
   */
  async dashboard(req, res, next) {
    try {
      const userId = req.user.id;
      const profile = await affiliateService.getProfileByUserId(userId);
      if (!profile) {
        return res.status(404).json({
          success: false,
          data: null,
          message: 'Affiliate profile not found for this user.'
        });
      }

      res.json({
        success: true,
        data: {
          profile,
          referral_link: `${req.protocol}://${req.get('host')}/api/v1/affiliate/track?ref=${profile.referral_code}`,
          available_balance: (parseFloat(profile.total_earned) - parseFloat(profile.total_paid)).toFixed(2)
        },
        message: 'Affiliate dashboard retrieved successfully.'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /affiliate/commissions
   */
  async commissions(req, res, next) {
    try {
      const userId = req.user.id;
      const comms = await affiliateService.getCommissions(userId);
      res.json({
        success: true,
        data: comms,
        message: 'Affiliate commissions log retrieved.'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /affiliate/payout/request
   */
  async requestPayout(req, res, next) {
    try {
      const userId = req.user.id;
      const { amount, method } = req.body;
      const payout = await affiliateService.requestPayout(userId, amount, method);
      res.status(201).json({
        success: true,
        data: payout,
        message: 'Payout request submitted successfully.'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /affiliate/payout/history
   */
  async payoutHistory(req, res, next) {
    try {
      const userId = req.user.id;
      const payouts = await affiliateService.getPayouts(userId);
      res.json({
        success: true,
        data: payouts,
        message: 'Payout history retrieved.'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /affiliate/links
   */
  async links(req, res, next) {
    try {
      const userId = req.user.id;
      const profile = await affiliateService.getProfileByUserId(userId);
      if (!profile) {
        return res.status(404).json({
          success: false,
          data: null,
          message: 'Affiliate profile not found.'
        });
      }

      const baseUrl = `${req.protocol}://${req.get('host')}`;
      res.json({
        success: true,
        data: {
          referral_code: profile.referral_code,
          default_link: `${baseUrl}/api/v1/affiliate/track?ref=${profile.referral_code}`,
          custom_link_builder_format: `${baseUrl}/api/v1/affiliate/track?ref=${profile.referral_code}&redirect=/products/:slug`
        },
        message: 'Referral links generated.'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /affiliate/track (Public)
   */
  async track(req, res, next) {
    try {
      const refCode = req.query.ref;
      const redirectUrl = req.query.redirect || '/';

      if (refCode) {
        await affiliateService.trackClick({
          refCode,
          ipAddress: req.ip,
          userAgent: req.get('user-agent'),
          landingUrl: redirectUrl
        });

        // Get cookie duration setting
        const [settings] = await db.query(
          `SELECT setting_value FROM settings WHERE setting_key = 'affiliate_cookie_days'`
        );
        const cookieDays = settings.length > 0 ? parseInt(settings[0].setting_value, 10) || 30 : 30;

        res.cookie('ref', refCode.trim().toLowerCase(), {
          maxAge: cookieDays * 24 * 60 * 60 * 1000,
          httpOnly: true
        });
      }

      res.json({
        success: true,
        data: { ref: refCode, redirectUrl },
        message: 'Referral click tracked successfully.'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /admin/affiliates
   */
  async adminList(req, res, next) {
    try {
      const affiliates = await affiliateService.adminListAffiliates();
      res.json({
        success: true,
        data: affiliates,
        message: 'Affiliate profiles listed.'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /admin/affiliates/:id
   */
  async adminDetail(req, res, next) {
    try {
      const affiliate = await affiliateService.adminGetAffiliate(req.params.id);
      if (!affiliate) {
        return res.status(404).json({
          success: false,
          data: null,
          message: 'Affiliate not found.'
        });
      }
      res.json({
        success: true,
        data: affiliate,
        message: 'Affiliate detail retrieved.'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /admin/affiliates/:id/commission
   */
  async adminSetCommission(req, res, next) {
    try {
      const affiliateId = req.params.id;
      const tier = await affiliateService.adminSetCommissionTier(affiliateId, req.body);
      res.json({
        success: true,
        data: tier,
        message: 'Commission tier set successfully.'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /admin/affiliates/:id/status
   */
  async adminUpdateStatus(req, res, next) {
    try {
      const affiliateId = req.params.id;
      const { status } = req.body;
      const result = await affiliateService.adminUpdateStatus(affiliateId, status);
      res.json({
        success: true,
        data: result,
        message: 'Affiliate status updated.'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /admin/affiliates/payouts
   */
  async adminListPayouts(req, res, next) {
    try {
      const payouts = await affiliateService.adminListPayouts();
      res.json({
        success: true,
        data: payouts,
        message: 'Payout requests listed.'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /admin/affiliates/payouts/:id
   */
  async adminProcessPayout(req, res, next) {
    try {
      const payoutId = req.params.id;
      const { status, admin_note } = req.body;
      const result = await affiliateService.adminProcessPayout(payoutId, status, admin_note, req.user.id);
      res.json({
        success: true,
        data: result,
        message: `Payout request updated to ${status}.`
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new AffiliateController();
