/** @odoo-module **/

import {blockUI, unblockUI} from "web.framework";
import {onWillRender, useRef, useState} from "@odoo/owl";

import {X2ManyField} from "@web/views/fields/x2many/x2many_field";
import {registry} from "@web/core/registry";

import {useX2ManyCrud} from "@web/views/fields/relational_utils";

export class FsImageRelationDndUploadField extends X2ManyField {
    /**
     * When using this widget, displayed image relation views must contains
     * following fields:
     * - sequence
     * - image_id
     * - specific_image
     * - link_existing
     */
    setup() {
        super.setup();
        this.options = this.activeField.options;
        this.defaultTarget = this.options.target || "specific";
        this.state = useState({
            dragging: false,
            target: this.defaultTarget,
        });
        this.fileInput = useRef("fileInput");
        this.defaultSequence = 0;

        this.operations = useX2ManyCrud(() => this.list, this.isMany2Many);

        onWillRender(() => {
            this.initDefaultSequence();
        });
    }

    get targetImage() {
        return this.state.target;
    }

    get relationRecordId() {
        return this.props.record.data.id;
    }

    get displayDndZone() {
        const activeActions = this.activeActions;
        return (
            ("link" in activeActions ? activeActions.link : activeActions.create) &&
            !this.props.readonly
        );
    }

    initDefaultSequence() {
        let sequence = 0;
        _.each(this.props.value.records, (record) => {
            sequence = record.data.sequence;
            if (sequence >= this.defaultSequence) {
                this.defaultSequence = sequence + 1;
            }
        });
    }

    getNewSequence() {
        const sequence = this.defaultSequence;
        this.defaultSequence += 1;
        return sequence;
    }

    setDragging() {
        this.state.dragging = true;
    }

    setNotDragging() {
        this.state.dragging = false;
    }

    onDragEnter(ev) {
        ev.preventDefault();
        this.setDragging();
    }

    onDragLeave(ev) {
        ev.preventDefault();
        this.setNotDragging();
    }

    onClickSelectDocuments(ev) {
        ev.preventDefault();
        this.fileInput.el.click();
    }

    onDrop(ev) {
        ev.preventDefault();
        this.setNotDragging();
        this.uploadImages(ev.dataTransfer.files);
    }

    onFilesSelected(ev) {
        ev.preventDefault();
        this.uploadImages(ev.target.files);
    }

    onChangeImageTarget(ev) {
        this.state.target = ev.target.value;
    }

    async uploadFsImage(imagesDesc) {
        const self = this;
        self.env.model.orm
            .call("fs.image", "create", [imagesDesc])
            .then((fsImageIds) => {
                let values = {};
                _.each(fsImageIds, (fsImageId) => {
                    values = self.getFsImageRelationValues(fsImageId);
                    self.createFieldRelationRecords(values);
                });
                unblockUI();
            })
            .catch(() => {
                self.displayUploadError();
            });
    }

    displayUploadError() {
        unblockUI();
        this.env.services.notification.add(
            this.env._t("An error occurred during the images upload."),
            {
                type: "danger",
                sticky: true,
            }
        );
    }

    getFsImageRelationValues(fsImageId) {
        let values = {
            default_image_id: fsImageId,
            default_link_existing: true,
        };
        values = {...values, ...this.getRelationCommonValues()};
        return values;
    }

    async uploadSpecificImage(imagesDesc) {
        const self = this;
        _.each(imagesDesc, (imageDesc) => {
            self.createFieldRelationRecords(
                self.getSpecificImageRelationValues(imageDesc)
            );
        });
        unblockUI();
    }

    getSpecificImageRelationValues(imageDesc) {
        return {
            ...this.getRelationCommonValues(),
            default_specific_image: imageDesc.image,
        };
    }

    getRelationCommonValues() {
        return {
            default_sequence: this.getNewSequence(),
        };
    }

    async createFieldRelationRecords(createValues) {
        await this.list.addNew({
            position: "bottom",
            context: createValues,
            mode: "readonly",
            allowWarning: true,
        });
    }

    async uploadImages(files) {
        const self = this;
        const promises = [];
        blockUI();
        _.each(files, function (file) {
            if (!file.type.includes("image")) {
                return;
            }
            const filePromise = new Promise(function (resolve) {
                const reader = new FileReader();
                reader.readAsDataURL(file);
                reader.onload = function (upload) {
                    let data = upload.target.result;
                    data = data.split(",")[1];
                    resolve([file.name, data]);
                };
            });
            promises.push(filePromise);
        });
        return Promise.all(promises).then(function (fileContents) {
            const imagesDesc = [];
            _.each(fileContents, function (fileContent) {
                imagesDesc.push(self.getFileImageDesc(fileContent));
            });
            if (imagesDesc.length > 0) {
                switch (self.targetImage) {
                    case "fs_image":
                        self.uploadFsImage(imagesDesc);
                        break;
                    case "specific":
                        self.uploadSpecificImage(imagesDesc);
                        break;
                    default:
                        unblockUI();
                }
            } else {
                unblockUI();
            }
        });
    }

    getFileImageDesc(fileContent) {
        return {
            image: {
                filename: fileContent[0],
                content: fileContent[1],
            },
        };
    }
}

FsImageRelationDndUploadField.template = "web.FsImageRelationDndUploadField";

registry
    .category("fields")
    .add("fs_image_relation_dnd_upload", FsImageRelationDndUploadField);