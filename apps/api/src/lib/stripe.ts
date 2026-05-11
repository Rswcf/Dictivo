import Stripe from "stripe";
import { config } from "../config.js";

export const stripe = config.STRIPE_SECRET_KEY
  ? new Stripe(config.STRIPE_SECRET_KEY, {
      apiVersion: "2026-02-25.clover"
    })
  : null;
