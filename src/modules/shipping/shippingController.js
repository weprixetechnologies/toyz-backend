const shippingService = require('./shippingService');

class ShippingController {
  /**
   * GET /cart/shipping-options
   */
  async getShippingOptions(req, res, next) {
    try {
      const presets = await shippingService.getActivePresets();
      res.json({
        success: true,
        data: presets,
        message: 'Active shipping options retrieved.'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /admin/shipping/presets
   */
  async adminListPresets(req, res, next) {
    try {
      const presets = await shippingService.adminListPresets();
      res.json({
        success: true,
        data: presets,
        message: 'Shipping presets listed.'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /admin/shipping/presets
   */
  async adminCreatePreset(req, res, next) {
    try {
      const preset = await shippingService.adminCreatePreset(req.body);
      res.status(201).json({
        success: true,
        data: preset,
        message: 'Shipping preset created successfully.'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /admin/shipping/presets/:id
   */
  async adminUpdatePreset(req, res, next) {
    try {
      const preset = await shippingService.adminUpdatePreset(req.params.id, req.body);
      res.json({
        success: true,
        data: preset,
        message: 'Shipping preset updated.'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /admin/shipping/presets/:id
   */
  async adminDeletePreset(req, res, next) {
    try {
      const result = await shippingService.adminDeletePreset(req.params.id);
      res.json({
        success: true,
        data: result,
        message: 'Shipping preset deleted.'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /admin/orders/:id/shipments
   */
  async createShipment(req, res, next) {
    try {
      const orderId = req.params.id;
      const result = await shippingService.createShipment(orderId, req.body);
      res.status(201).json({
        success: true,
        data: result,
        message: 'Split shipment created successfully.'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /admin/orders/:id/shipments/:sId
   */
  async updateShipment(req, res, next) {
    try {
      const shipmentId = req.params.sId;
      const result = await shippingService.updateShipment(shipmentId, req.body);
      res.json({
        success: true,
        data: result,
        message: 'Shipment tracking info updated.'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /orders/:id/shipments
   */
  async getOrderShipments(req, res, next) {
    try {
      const orderId = req.params.id;
      const result = await shippingService.getOrderShipments(orderId);
      res.json({
        success: true,
        data: result,
        message: 'Order packages and shipments retrieved.'
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new ShippingController();
