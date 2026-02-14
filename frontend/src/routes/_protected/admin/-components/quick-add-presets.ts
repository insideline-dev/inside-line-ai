import type { QuickCreateStartupDto } from "@/api/generated/model";

interface Preset {
  id: string;
  label: string;
  emoji: string;
  data: QuickCreateStartupDto;
}

export const QUICK_ADD_PRESETS: Preset[] = [
  {
    id: "airbnb",
    label: "Airbnb",
    emoji: "🏠",
    data: {
      name: "Airbnb",
      tagline: "Book unique homes and experiences all over the world",
      description:
        "Airbnb is an online marketplace for lodging, primarily homestays for vacation rentals, and tourism activities. The platform allows hosts to list their properties for short-term rental and enables guests to search and book unique accommodations worldwide. Founded in 2008, Airbnb disrupted the traditional hospitality industry by creating a peer-to-peer marketplace that connects travelers with local hosts.",
      website: "https://airbnb.com",
      location: "San Francisco, CA",
      industry: "Travel & Hospitality",
      stage: "seed",
      fundingTarget: 600000,
      teamSize: 3,
      teamMembers: [
        { name: "Brian Chesky", role: "CEO", linkedinUrl: "https://linkedin.com/in/brianchesky" },
        { name: "Joe Gebbia", role: "CPO", linkedinUrl: "https://linkedin.com/in/jgebbia" },
        { name: "Nathan Blecharczyk", role: "CTO", linkedinUrl: "https://linkedin.com/in/nblecharczyk" },
      ],
    },
  },
  {
    id: "uber",
    label: "Uber",
    emoji: "🚗",
    data: {
      name: "Uber",
      tagline: "Everyone's private driver at the tap of a button",
      description:
        "Uber is a ride-hailing platform that connects riders with drivers through a mobile application. The service provides on-demand transportation in cities worldwide, offering various ride options from economy to premium vehicles. Founded in 2009, Uber transformed urban transportation by leveraging smartphone technology and GPS to create a seamless, cashless ride experience.",
      website: "https://uber.com",
      location: "San Francisco, CA",
      industry: "Transportation & Logistics",
      stage: "seed",
      fundingTarget: 1500000,
      teamSize: 4,
      teamMembers: [
        { name: "Travis Kalanick", role: "CEO", linkedinUrl: "https://linkedin.com/in/traviskalanick" },
        { name: "Garrett Camp", role: "Chairman", linkedinUrl: "https://linkedin.com/in/garrettcamp" },
      ],
    },
  },
  {
    id: "stripe",
    label: "Stripe",
    emoji: "💳",
    data: {
      name: "Stripe",
      tagline: "Online payment processing for internet businesses",
      description:
        "Stripe is a technology company that builds economic infrastructure for the internet. Businesses of every size use Stripe's software and APIs to accept payments, send payouts, and manage their businesses online. Stripe's products power payments for online and in-person retailers, subscription businesses, software platforms, and marketplaces.",
      website: "https://stripe.com",
      location: "San Francisco, CA",
      industry: "Fintech",
      stage: "seed",
      fundingTarget: 2000000,
      teamSize: 2,
      teamMembers: [
        { name: "Patrick Collison", role: "CEO", linkedinUrl: "https://linkedin.com/in/patrickcollison" },
        { name: "John Collison", role: "President", linkedinUrl: "https://linkedin.com/in/johncollison" },
      ],
    },
  },
];
