/** A Drive folder the user picked: enough to show it and save its id. */
export interface PickedFolder {
  id: string;
  name: string;
}

/** folder id → human reason it can't be picked, e.g. 'Already the Raw folder of “Client A”' */
export type DisabledFolders = Record<string, string>;

/** Drive's alias for the top of My Drive. */
export const ROOT_FOLDER_ID = 'root';

export const MY_DRIVE_NAME = 'My Drive';

/** Work processes can't use folders that live in a shared drive (yet). */
export const SHARED_DRIVE_REASON = 'Shared drives aren’t supported yet';
