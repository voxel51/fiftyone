/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

/**
 * Distills a key sequence in to a match structure
 * suitable for matching to KeyboardEvents
 */
export class KeySequence {
    public isCtrl = false;
    public isMeta = false;
    public isShift = false;
    public isAlt = false;
    public key = "";
    //Equality check to another sequence
    public equals(other: KeySequence) {
        return (
            other.isCtrl == this.isCtrl &&
            other.isMeta == this.isMeta &&
            other.isShift == this.isShift &&
            other.isAlt == this.isAlt &&
            other.key == this.key
        );
    }
    //Match for KeyboardEvents
    public matches(event: KeyboardEvent) {
        let key = event.key.toLocaleLowerCase();
        if (event.key.length === 1 && event.key.charCodeAt(0) === 160) {
            //handles the case where alt+space changes the key from " "(32) to &nbsp(160)
            key = ' ';
        }
        return (
            (event.ctrlKey === this.isCtrl) &&
            (event.metaKey === this.isMeta) &&
            (event.shiftKey === this.isShift) &&
            (event.altKey === this.isAlt) &&
            (key === this.key)
        );
    }
    /**
     * Returns a string representation that is
     * normalized to lower case and without 
     * white space.
     */
    public toString(): string {
        let ret = "";
        if (this.isCtrl) {
            ret += "ctrl";
        }

        if (this.isAlt) {
            if (ret.length > 0) {
                ret += "+";
            }
            ret += "alt"
        }
        if (this.isShift) {
            if (ret.length > 0) {
                ret += "+";
            }
            ret += "shift";
        }
        if (this.isMeta) {
            if (ret.length > 0) {
                ret += "+"
            }
            ret += "meta";
        }
        if (this.key) {
            if (ret.length > 0) {
                ret += "+"
            }
            if (this.key === " ") {
                ret += "space";
            }
            else {
                ret += this.key;
            }
        }
        return ret;
    }
}

type SequenceModifier = (sequence: KeySequence) => void;

/**
 * The KeyParser takes strings in the for of "Key+Key..." and in
 * sequences delimited by ",".  For instance "ctrl+K,alt+M".
 * You may not use two or more stardard keys in a binding, such as "x+z".
 * Since "+" and "," are reserved in the specifying format, to bind those 2 
 * keys you can use:
 *  - for +: "ctrl+\\+" or "ctrl+="
 *  - for ,: "ctrl+\\,"
 * All keys are case insensitive any use their lowercase representation.
 * Shift is not inferred from key case.
 */
export class KeyParser {
    private static modifierMap: Map<string, SequenceModifier> = new Map([
        [
            "ctrl",
            (sequence) => {
                sequence.isCtrl = true;
            },
        ],
        [
            "alt",
            (sequence) => {
                sequence.isAlt = true;
            },
        ],
        [
            "meta",
            (sequence) => {
                sequence.isMeta = true;
            },
        ],
        [
            "shift",
            (sequence) => {
                sequence.isShift = true;
            },
        ],
    ]);
    private static multiCharKeys: Set<string> = new Set([
        "arrowup",
        "arrowdown",
        "arrowleft",
        "arrowright",
        "home",
        "end",
        "pageup",
        "pagedown",
        "backspace",
        "delete",
        "tab",
        "enter",
        "escape",
        "f1",
        "f2",
        "f3",
        "f4",
        "f5",
        "f6",
        "f7",
        "f8",
        "f9",
        "f10",
        "f11",
        "f12",
        "f13",
        "f14",
        "f15",
    ]);

    public static isModifier(key: string): boolean {
        return this.modifierMap.has(key.trim().toLocaleLowerCase());
    }
    /**
     * Parses the binding string
     * @param binding A key sequence of "ctrl+s", etc
     * @returns An array of KeySequences that can be used to match or normalize.
     */
    public static parseBinding(binding: string): Array<KeySequence> {
        const sequences = binding.trim().split(/(?<!\\),/);
        const ret = new Array<KeySequence>();
        sequences.forEach((sequence) => {
            if (sequence.trim().length === 0) {
                throw new Error(`The binding ${binding} contains an empty sequence`);
            }
            const keySequence = new KeySequence();
            const keys = sequence.split(/(?<!\\)\+/);
            keys.forEach((key) => {
                const keyLow = key.trim().toLocaleLowerCase();
                const modifier = this.modifierMap.get(keyLow);
                if (modifier) {
                    modifier(keySequence);
                } else {
                    if (keySequence.key !== "") {
                        throw new Error(
                            `Multiple standard keys in keybinding: ${sequence}`
                        );
                    }
                    switch (keyLow) {
                        case "space":
                            keySequence.key = ' ';
                            break;
                        //unescape \+ (= is the lower case)
                        case "\\+":
                            keySequence.key = "=";
                            break;
                        //unescape \,
                        case "\\,":
                            keySequence.key = ",";
                            break;
                        default:
                            if (keyLow.length === 1 || this.multiCharKeys.has(keyLow)) {
                                keySequence.key = keyLow;
                            } else {
                                if (keyLow.length === 0) {
                                    throw new Error(`The binding ${binding} is missing a key.`);
                                }
                                throw new Error(
                                    `The binding ${binding} contains an invalid key ${key.trim()}`
                                );
                            }
                            break;
                    }
                }
            });
            ret.push(keySequence);
        });
        return ret;
    }
}
