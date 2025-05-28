class RateLimiter {
  constructor(options = {}) {
    this.maxRequests = options.maxRequests || 25;
    this.interval = options.interval || 60000; // 1 minute
    this.requests = [];
  }

  async checkLimit() {
    const now = Date.now();
    
    // Remove old requests outside the interval window
    this.requests = this.requests.filter(
      timestamp => now - timestamp < this.interval
    );

    if (this.requests.length >= this.maxRequests) {
      const oldestRequest = this.requests[0];
      const waitTime = this.interval - (now - oldestRequest) + 100; // Add 100ms buffer
      
      if (waitTime > 0) {
        await this.sleep(waitTime);
        return this.checkLimit(); // Recursive check after waiting
      }
    }

    this.requests.push(now);
  }

  getRemainingRequests() {
    const now = Date.now();
    this.requests = this.requests.filter(
      timestamp => now - timestamp < this.interval
    );
    return Math.max(0, this.maxRequests - this.requests.length);
  }

  getResetTime() {
    if (this.requests.length === 0) {
      return null;
    }
    
    const oldestRequest = this.requests[0];
    return new Date(oldestRequest + this.interval);
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  reset() {
    this.requests = [];
  }
}

module.exports = { RateLimiter };