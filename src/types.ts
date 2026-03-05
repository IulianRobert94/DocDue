/**
 * DocDue — Shared Type Utilities
 */

import { Ionicons } from '@expo/vector-icons';

/** Valid Ionicons icon name — derived from the glyph map */
export type IconName = React.ComponentProps<typeof Ionicons>['name'];
