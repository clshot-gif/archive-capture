import { useEffect, useMemo, useState } from 'react';
import * as StorageService from '../services/StorageService';

const MAX_SUGGESTIONS = 5;

// Suggests tags from the cross-collection "ever used" pool as she types a
// new tag, so she doesn't have to go hunting through Previous Tags for one
// she already knows exists — just type the start of it and tap it.
export default function useTagAutocomplete(queryText, excludeTags) {
  const [allTagsEver, setAllTagsEver] = useState([]);

  useEffect(() => {
    StorageService.loadAllTagsEver().then(setAllTagsEver);
  }, []);

  return useMemo(() => {
    const query = queryText.trim().toLowerCase();
    if (!query) return [];
    return allTagsEver
      .filter((tag) => !excludeTags.includes(tag))
      .filter((tag) => tag.toLowerCase().startsWith(query))
      .slice(0, MAX_SUGGESTIONS);
  }, [queryText, allTagsEver, excludeTags]);
}
