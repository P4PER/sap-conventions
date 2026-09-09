import type { Logger } from "../logger";

export class Engine {
    constructor(private readonly logger: Logger) {
        this.logger = logger;
        this.logger.info("ready");
    }
}
