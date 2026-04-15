import {
  Injectable,
  Logger,
  OnModuleDestroy,
  InternalServerErrorException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import puppeteer, { Browser, Page } from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import { JWT_COOKIE_NAME } from "../../../auth/auth.constants";
import { PrintTokenService } from "./print-token.service";

type PrintKind = "memo" | "report";

@Injectable()
export class PdfRenderService implements OnModuleDestroy {
  private readonly logger = new Logger(PdfRenderService.name);
  private browserPromise: Promise<Browser> | null = null;
  private readonly navigationTimeoutMs = 45_000;
  private readonly readyTimeoutMs = 30_000;

  constructor(
    private config: ConfigService,
    private printTokens: PrintTokenService,
  ) {}

  async renderMemo(startupId: string, userId: string): Promise<Buffer> {
    return this.render("memo", startupId, userId);
  }

  async renderReport(startupId: string, userId: string): Promise<Buffer> {
    return this.render("report", startupId, userId);
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.browserPromise) return;
    try {
      const browser = await this.browserPromise;
      await browser.close();
    } catch (err) {
      this.logger.warn(`Failed to close browser cleanly: ${(err as Error).message}`);
    }
    this.browserPromise = null;
  }

  private async render(
    kind: PrintKind,
    startupId: string,
    userId: string,
  ): Promise<Buffer> {
    const { token } = this.printTokens.mint(userId, startupId, kind);
    const frontendUrl = this.config.get<string>("FRONTEND_URL") ?? "http://localhost:3030";
    const url = new URL(`/print/${kind}/${startupId}`, frontendUrl).toString();

    const browser = await this.getBrowser();
    const page = await browser.newPage();
    try {
      await page.setViewport({ width: 1200, height: 1600, deviceScaleFactor: 2 });
      await page.emulateMediaType("print");

      const cookieDomain = new URL(frontendUrl).hostname;
      await page.setCookie({
        name: JWT_COOKIE_NAME,
        value: token,
        domain: cookieDomain,
        path: "/",
        httpOnly: true,
        secure: !this.isDev(),
      });

      this.logger.log(`Rendering ${kind} PDF for startup ${startupId} at ${url}`);
      await page.goto(url, { waitUntil: "networkidle0", timeout: this.navigationTimeoutMs });
      await page.waitForFunction("window.__PRINT_READY__ === true", {
        timeout: this.readyTimeoutMs,
      });

      const pdf = await page.pdf({
        format: "A4",
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: this.headerTemplate(),
        footerTemplate: this.footerTemplate(),
        margin: { top: "22mm", bottom: "18mm", left: "14mm", right: "14mm" },
        preferCSSPageSize: false,
      });

      return Buffer.from(pdf);
    } catch (err) {
      this.logger.error(
        `Puppeteer render failed for ${kind} ${startupId}: ${(err as Error).message}`,
      );
      throw new InternalServerErrorException(
        `Failed to render ${kind} PDF: ${(err as Error).message}`,
      );
    } finally {
      await this.safeClosePage(page);
    }
  }

  private async getBrowser(): Promise<Browser> {
    if (this.browserPromise) {
      const browser = await this.browserPromise;
      if (browser.connected) return browser;
      this.browserPromise = null;
    }

    this.browserPromise = (async () => {
      const executablePath =
        this.config.get<string>("PUPPETEER_EXECUTABLE_PATH") ??
        (await this.resolveExecutablePath());

      return puppeteer.launch({
        args: [
          ...chromium.args,
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
        ],
        executablePath,
        headless: true,
        defaultViewport: { width: 1200, height: 1600 },
      });
    })();

    const browser = await this.browserPromise;
    browser.on("disconnected", () => {
      this.browserPromise = null;
    });
    return browser;
  }

  private async resolveExecutablePath(): Promise<string> {
    try {
      return await chromium.executablePath();
    } catch {
      // On macOS/dev, fall back to local Chrome.
      if (process.platform === "darwin") {
        return "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
      }
      if (process.platform === "linux") {
        return "/usr/bin/google-chrome";
      }
      throw new Error("No Chrome executable found for Puppeteer");
    }
  }

  private async safeClosePage(page: Page | null): Promise<void> {
    if (!page) return;
    try {
      await page.close();
    } catch (err) {
      this.logger.warn(`Failed to close page: ${(err as Error).message}`);
    }
  }

  private isDev(): boolean {
    return (this.config.get<string>("NODE_ENV") ?? "development") === "development";
  }

  private headerTemplate(): string {
    return `<div style="font-family: 'DM Sans', Helvetica, Arial, sans-serif; font-size: 8px; color: #6b7280; width: 100%; padding: 0 14mm; display: flex; justify-content: space-between; align-items: center;">
      <span style="letter-spacing: 0.08em; text-transform: uppercase;">Inside Line</span>
      <span class="date"></span>
    </div>`;
  }

  private footerTemplate(): string {
    return `<div style="font-family: 'DM Sans', Helvetica, Arial, sans-serif; font-size: 8px; color: #6b7280; width: 100%; padding: 0 14mm; display: flex; justify-content: space-between; align-items: center;">
      <span>Confidential</span>
      <span><span class="pageNumber"></span> / <span class="totalPages"></span></span>
    </div>`;
  }
}
