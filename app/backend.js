/**
 * The only place that talks to Firestore about projects.
 *
 * projects.js never imports the SDK. It is handed one of these objects, so the
 * same UI code runs against the real database in the browser and against an
 * in-memory double in the tests — which is how the create path can be exercised
 * at all, given that email-link sign-in cannot be automated.
 *
 * What the security rules force, and why each is here rather than in the UI:
 *
 *   The project document and the membership index CANNOT be written in one
 *   batch. The membership rule calls get(projects/{pid}) to check the claimed
 *   role against the stored roles map, and rules evaluate a batched write
 *   against the database as it was BEFORE the batch — the project would not
 *   exist yet. So they are two sequential writes, and the gap between them is
 *   the caller's to recover from.
 *
 *   projects/ has `allow list: if false`, deliberately. A list rule has to read
 *   resource.data, so an empty result set is allowed through while a hit is
 *   denied, and that difference is itself an answer. Listing therefore reads
 *   the personal index at users/{uid}/memberships and fetches each project by
 *   id; a stale row buys one denied get and nothing else.
 *
 *   created_at and updated_at must equal request.time exactly, so they are
 *   always serverTimestamp(). A client clock is never trusted.
 *
 *   An auto id is 20 characters of [A-Za-z0-9], which is what pidOk() requires.
 */

/** Wraps the Firestore module handed over by the auth bridge. */
export function firestoreBackend(api) {
  const { fs, db } = api;

  return {
    /** A new project id, generated client-side so the two writes can share it. */
    newId() {
      return fs.doc(fs.collection(db, "projects")).id;
    },

    /**
     * Write the project document. Born single-owner: adding collaborators is a
     * separate, invited write, so that every membership change has its own
     * trail instead of hiding inside creation.
     */
    createProject(pid, uid, fields) {
      const roles = {};
      roles[uid] = "owner";
      return fs.setDoc(fs.doc(db, "projects", pid), {
        name: fields.name,
        project_type: fields.projectType,
        question_type: fields.questionType,
        area_of_research: fields.areaOfResearch,
        dataset_kind: fields.datasetKind,
        roles: roles,
        archived: false,
        // archived_at is omitted, not sent as null: create requires it to be
        // absent, and leaving it out makes sending a value impossible.
        created_at: fs.serverTimestamp(),
        created_by: uid,
        updated_at: fs.serverTimestamp(),
        updated_by: uid
      });
    },

    /** The personal index entry that makes the project findable again. */
    addMembership(pid, uid) {
      return fs.setDoc(fs.doc(db, "users", uid, "memberships", pid), {
        role: "owner",
        added_at: fs.serverTimestamp()
      });
    },

    /**
     * Every project this user can open, newest first. A membership whose
     * project is gone, archived, or no longer readable is skipped rather than
     * surfaced — that is exactly the behaviour the rules were written to
     * produce, and an error row would only confuse.
     */
    listProjects(uid) {
      return fs.getDocs(fs.collection(db, "users", uid, "memberships"))
        .then(snap => {
          const ids = [];
          snap.forEach(d => ids.push(d.id));
          return Promise.all(ids.map(pid =>
            fs.getDoc(fs.doc(db, "projects", pid))
              .then(d => {
                if (!d.exists()) return null;
                const p = d.data();
                if (p.archived) return null;
                p.id = d.id;
                return p;
              })
              .catch(() => null)
          ));
        })
        .then(rows => rows.filter(Boolean).sort((a, b) => seconds(b) - seconds(a)));
    }
  };
}

function seconds(p) {
  return (p && p.created_at && p.created_at.seconds) || 0;
}

/**
 * Turn a Firestore error into one of the few things a person can act on.
 * Returns an i18n key, or null when there is nothing better to say than the
 * raw code.
 */
export function explainError(err, user) {
  const code = (err && err.code) || "";
  if (code === "permission-denied") {
    return user && user.emailVerified === false ? "err_unverified" : "err_denied";
  }
  if (code === "unavailable" || code === "failed-precondition") return "err_offline";
  return null;
}
