class PaymentGateway {
  static keyName = 'base';
  static displayName = 'Base Gateway';

  async initiate({ order, user, amount, currency }) {
    throw new Error('Method initiate() must be implemented');
  }

  async verify({ payload }) {
    throw new Error('Method verify() must be implemented');
  }

  async refund({ transactionId, amount }) {
    throw new Error('Method refund() must be implemented');
  }

  async handleWebhook({ headers, body }) {
    throw new Error('Method handleWebhook() must be implemented');
  }
}

module.exports = PaymentGateway;
