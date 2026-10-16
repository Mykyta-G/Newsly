import { promises as fs } from "fs";
import path from "path";

// Hackathon storage: a JSON file. Swap for a real DB when it matters.
const FILE = path.join(process.cwd(), "data", "subscribers.json");

export async function getSubscribers(): Promise<string[]> {
  try {
    return JSON.parse(await fs.readFile(FILE, "utf8"));
  } catch {
    return [];
  }
}

export async function addSubscriber(email: string) {
  const list = await getSubscribers();
  if (!list.includes(email)) {
    list.push(email);
    await fs.mkdir(path.dirname(FILE), { recursive: true });
    await fs.writeFile(FILE, JSON.stringify(list, null, 2));
  }
  return list.length;
}
