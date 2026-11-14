import { providerJson, ProviderError } from "./providers";

type HubSpotContact = {
  id: string;
  properties?: {
    email?: string;
    firstname?: string;
    lastname?: string;
  };
};

type HubSpotSearchResult = {
  results?: HubSpotContact[];
};

async function findContactByEmail(email: string) {
  const response = await providerJson<HubSpotSearchResult>(
    "hubspot",
    "/crm/v3/objects/contacts/search",
    {
      method: "POST",
      body: {
        filterGroups: [
          {
            filters: [
              {
                propertyName: "email",
                operator: "EQ",
                value: email,
              },
            ],
          },
        ],
        properties: ["email", "firstname", "lastname"],
        limit: 1,
      },
    },
  );
  return response.results?.[0] ?? null;
}

function contactNameProperties(name: string, email: string) {
  if (!name || name.toLowerCase() === email.toLowerCase()) return {};
  const parts = name
    .replace(/[<>"]/g, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return {};
  return {
    firstname: parts[0],
    ...(parts.length > 1 ? { lastname: parts.slice(1).join(" ") } : {}),
  };
}

export async function ensureHubSpotContact(input: {
  email: string;
  name: string;
}) {
  const existing = await findContactByEmail(input.email);
  if (existing?.id) {
    return { contactId: existing.id, created: false };
  }

  try {
    const created = await providerJson<{ id?: string }>(
      "hubspot",
      "/crm/v3/objects/contacts",
      {
        method: "POST",
        body: {
          properties: {
            email: input.email,
            ...contactNameProperties(input.name, input.email),
          },
        },
      },
    );
    if (!created.id) {
      throw new ProviderError(
        "hubspot",
        502,
        "HubSpot did not confirm the new contact.",
      );
    }
    return { contactId: created.id, created: true };
  } catch (error) {
    if (error instanceof ProviderError && error.status === 409) {
      const racedContact = await findContactByEmail(input.email);
      if (racedContact?.id) {
        return { contactId: racedContact.id, created: false };
      }
    }
    throw error;
  }
}

